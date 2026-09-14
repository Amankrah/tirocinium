import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { listCaseStudies } from "@/lib/api/case-studies";
import { getCourse } from "@/lib/api/courses";
import {
  getShortlist,
  listCatalogues,
  reviewQuotes,
} from "@/lib/api/marketplace-authoring";
import { mass, money } from "@/lib/money";
import { requireProfessor } from "@/lib/professor-session";
import { ProfessorShell } from "../../../professor-shell";
import { signOut } from "../../../sign-in/actions";
import { strings } from "../../../strings";
import { pinCatalogueAction, unpinCatalogueAction } from "./actions";

// The professor's marketplace door (Phase 10, decision 0062): which catalogue
// version the course quotes against, which case studies shortlist from it, and
// what the cohort issued.
//
// A Server Component start to finish, so the route ships no client JavaScript.
// Every verb here is a form posting a server action and every filter is a link,
// which is also why it works with keys, a pointer, or neither.
//
// Every price on this page is a list price. A student's are struck from their
// own variant's seed, and the point of that is that nobody, professor included,
// is holding the same number.
export default async function MaterialsPage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<{ case_study?: string; cursor?: string }>;
}) {
  const { token, email } = await requireProfessor();
  const { courseId } = await params;
  const { case_study, cursor } = await searchParams;
  const id = Number(courseId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const course = await getCourse(token, id);
  if (!course) notFound();

  const s = strings.materials;
  const filtered = Number(case_study);
  const caseFilter =
    Number.isInteger(filtered) && filtered > 0 ? filtered : undefined;
  const from = Number(cursor);
  const page = Number.isInteger(from) && from > 0 ? from : undefined;

  const [catalogues, cases] = await Promise.all([
    listCatalogues(token, id),
    listCaseStudies(token, id),
  ]);
  const pinned = catalogues.ok ? catalogues.data.pinned : null;

  // Shortlists belong to case studies, so the counts are one read each. They go
  // out together rather than in sequence, and they are skipped entirely while
  // the course has no catalogue, because there would be nothing to count.
  const shortlists = pinned
    ? await Promise.all(
        cases.map(async (entry) => ({
          entry,
          count: await getShortlist(token, id, entry.id).then((result) =>
            result.ok ? result.data.skus.length : 0,
          ),
        })),
      )
    : [];

  const quotes = pinned
    ? await reviewQuotes(token, id, { caseStudyId: caseFilter, cursor: page })
    : null;
  const titles = new Map(cases.map((entry) => [entry.id, entry.title]));

  return (
    <ProfessorShell email={email} signOut={signOut}>
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-10 px-6 py-12">
        <div className="flex flex-col gap-2">
          <Link
            href={`/courses/${id}`}
            className="text-sm text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {s.back}
          </Link>
          <h1 className="font-display text-4xl">{s.title}</h1>
          <p className="max-w-[var(--measure-reading)] text-sm text-ink-muted">
            {s.intro}
          </p>
        </div>

        <section aria-labelledby="catalogue" className="flex flex-col gap-4">
          <h2 id="catalogue" className="font-display text-2xl">
            {s.catalogueHeading}
          </h2>
          {!catalogues.ok ? (
            <p role="alert" className="text-sm text-flag-amber">
              {s.error}
            </p>
          ) : catalogues.data.available.length === 0 ? (
            <p className="text-ink-muted">{s.noCatalogues}</p>
          ) : (
            <>
              {pinned === null ? <p className="text-ink-muted">{s.off}</p> : null}
              <ul className="flex flex-col divide-y divide-rule-line">
                {catalogues.data.available.map((choice) => {
                  const inUse =
                    pinned?.id === choice.id && pinned.version === choice.version;
                  return (
                    <li
                      key={`${choice.id}-${choice.version}`}
                      className="flex flex-wrap items-center justify-between gap-4 py-4"
                    >
                      <div className="flex flex-col gap-1">
                        <span className="font-display text-lg">{choice.title}</span>
                        <span className="font-mono text-xs tabular-nums text-ink-muted">
                          {s.version(choice.version)} ·{" "}
                          {s.catalogueSize(choice.line_count, choice.supplier_count)}
                        </span>
                      </div>
                      {inUse ? (
                        <span className="text-sm text-verify-green">{s.inUse}</span>
                      ) : (
                        <form
                          action={pinCatalogueAction.bind(
                            null,
                            id,
                            choice.id,
                            choice.version,
                          )}
                        >
                          <Button variant="quiet" type="submit" className="text-sm">
                            {s.use}
                          </Button>
                        </form>
                      )}
                    </li>
                  );
                })}
              </ul>
              <p className="max-w-[var(--measure-reading)] text-sm text-ink-muted">
                {s.pinNote}
              </p>
              {pinned !== null ? (
                <div className="flex flex-col gap-2 border-t border-rule-line pt-4">
                  <p className="max-w-[var(--measure-reading)] text-sm text-ink-muted">
                    {s.turnOffNote}
                  </p>
                  <form action={unpinCatalogueAction.bind(null, id)}>
                    <Button variant="quiet" type="submit" className="text-sm">
                      {s.turnOff}
                    </Button>
                  </form>
                </div>
              ) : null}
            </>
          )}
        </section>

        {pinned !== null ? (
          <>
            <section aria-labelledby="shortlists" className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <h2 id="shortlists" className="font-display text-2xl">
                  {s.shortlistsHeading}
                </h2>
                <p className="max-w-[var(--measure-reading)] text-sm text-ink-muted">
                  {s.shortlistsIntro}
                </p>
              </div>
              {shortlists.length === 0 ? (
                <p className="text-ink-muted">{strings.course.empty}</p>
              ) : (
                <ul className="flex flex-col divide-y divide-rule-line">
                  {shortlists.map(({ entry, count }) => (
                    <li
                      key={entry.id}
                      className="flex flex-wrap items-center justify-between gap-4 py-4"
                    >
                      <div className="flex flex-col gap-1">
                        <span className="font-display text-lg">{entry.title}</span>
                        <span className="text-xs text-ink-muted">
                          {s.shortlisted(count)}
                        </span>
                      </div>
                      <Link
                        href={`/courses/${id}/case-studies/${entry.id}/shortlist`}
                        className="text-sm text-accent underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                      >
                        {s.editShortlist}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby="quotes" className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <h2 id="quotes" className="font-display text-2xl">
                  {s.quotesHeading}
                </h2>
                <p className="max-w-[var(--measure-reading)] text-sm text-ink-muted">
                  {s.quotesIntro}
                </p>
              </div>

              {cases.length > 0 ? (
                <nav aria-label={s.quotesHeading} className="flex flex-wrap gap-3">
                  <FilterLink
                    href={`/courses/${id}/materials`}
                    label={s.everyCaseStudy}
                    current={caseFilter === undefined}
                  />
                  {cases.map((entry) => (
                    <FilterLink
                      key={entry.id}
                      href={`/courses/${id}/materials?case_study=${entry.id}`}
                      label={entry.title}
                      current={caseFilter === entry.id}
                    />
                  ))}
                </nav>
              ) : null}

              {!quotes?.ok ? (
                <p role="alert" className="text-sm text-flag-amber">
                  {s.error}
                </p>
              ) : quotes.data.entries.length === 0 ? (
                <p className="text-ink-muted">{s.quotesEmpty}</p>
              ) : (
                <>
                  <table className="w-full text-left text-sm">
                    <thead className="text-xs uppercase tracking-widest text-ink-muted">
                      <tr className="border-b border-rule-line">
                        <th scope="col" className="py-2 font-normal">
                          {s.colQuote}
                        </th>
                        <th scope="col" className="py-2 font-normal">
                          {s.colSeat}
                        </th>
                        <th scope="col" className="py-2 font-normal">
                          {s.colLines}
                        </th>
                        <th scope="col" className="py-2 font-normal">
                          {s.colTotal}
                        </th>
                        <th scope="col" className="py-2 font-normal">
                          {s.colMass}
                        </th>
                        <th scope="col" className="py-2 font-normal">
                          {s.colCited}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-rule-line">
                      {quotes.data.entries.map((entry) => (
                        <tr key={entry.quote_id}>
                          <td className="py-3">
                            <span className="font-mono text-xs tabular-nums">
                              {entry.quote_number}
                            </span>
                            <span className="block text-xs text-ink-muted">
                              {titles.get(entry.case_study_id) ?? ""}{" "}
                              {new Date(entry.issued_at * 1000)
                                .toISOString()
                                .slice(0, 10)}
                            </span>
                          </td>
                          <td className="py-3 font-mono text-xs tabular-nums">
                            {entry.seat_number}
                          </td>
                          <td className="py-3 tabular-nums">{entry.line_count}</td>
                          <td className="py-3 font-mono tabular-nums">
                            {money(entry.total_cents)}
                          </td>
                          <td className="py-3 font-mono tabular-nums">
                            {mass(entry.total_mass_grams)}
                          </td>
                          <td className="py-3 text-ink-muted">
                            {entry.cited ? s.cited : s.notCited}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {quotes.data.next_cursor !== null ? (
                    <div>
                      <Link
                        href={`/courses/${id}/materials?${new URLSearchParams({
                          ...(caseFilter === undefined
                            ? {}
                            : { case_study: String(caseFilter) }),
                          cursor: String(quotes.data.next_cursor),
                        })}`}
                        className="text-sm text-accent underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                      >
                        {s.older}
                      </Link>
                    </div>
                  ) : null}
                </>
              )}

              {quotes?.ok && quotes.data.tallies.length > 0 ? (
                <div className="flex flex-col gap-3 border-t border-rule-line pt-6">
                  <div className="flex flex-col gap-1">
                    <h3 className="font-display text-lg">{s.talliesHeading}</h3>
                    <p className="max-w-[var(--measure-reading)] text-sm text-ink-muted">
                      {s.talliesIntro}
                    </p>
                  </div>
                  <ul className="flex flex-col gap-2">
                    {quotes.data.tallies.map((tally) => (
                      <li
                        key={tally.sku}
                        className="flex flex-wrap items-baseline justify-between gap-3"
                      >
                        <span>
                          {tally.name}
                          <span className="ml-2 font-mono text-xs text-ink-muted">
                            {tally.sku}
                          </span>
                        </span>
                        <span className="font-mono text-xs tabular-nums text-ink-muted">
                          {s.tallyQuotes(tally.quote_count)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>
          </>
        ) : null}
      </main>
    </ProfessorShell>
  );
}

function FilterLink({
  href,
  label,
  current,
}: {
  href: string;
  label: string;
  current: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={
        "rounded-md border px-3 py-1 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent " +
        (current
          ? "border-accent text-ink"
          : "border-rule-line text-ink-muted hover:text-ink")
      }
    >
      {label}
    </Link>
  );
}
