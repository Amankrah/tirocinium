import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeading } from "@/components/ui/section-heading";
import { SegmentedNav } from "@/components/ui/segmented-nav";
import { Table, Td, Th, Tr } from "@/components/ui/table";
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

// The professor's marketplace door (Phase 10, decision 0076): which catalogue
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
    <ProfessorShell
      email={email}
      signOut={signOut}
      course={{ id, title: course.title, section: "materials" }}
    >
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-4 py-8 sm:px-6 lg:px-10">
        <PageHeader title={s.title} description={s.intro} />

        <section aria-labelledby="catalogue" className="flex flex-col gap-4">
          <SectionHeading id="catalogue" title={s.catalogueHeading} />
          {!catalogues.ok ? (
            <p role="alert" className="text-sm text-flag-amber">
              {s.error}
            </p>
          ) : catalogues.data.available.length === 0 ? (
            <EmptyState icon="store" body={s.noCatalogues} />
          ) : (
            <>
              {pinned === null ? (
                <p className="max-w-prose text-sm text-ink-muted">{s.off}</p>
              ) : null}
              <ul className="flex flex-col gap-3">
                {catalogues.data.available.map((choice) => {
                  const inUse =
                    pinned?.id === choice.id && pinned.version === choice.version;
                  return (
                    <Card
                      key={`${choice.id}-${choice.version}`}
                      as="li"
                      tone="flat"
                      padded={false}
                      className={
                        "flex flex-wrap items-center justify-between gap-4 px-5 py-4" +
                        (inUse ? " border-accent/40" : "")
                      }
                    >
                      <div className="flex flex-col gap-1">
                        <span className="font-display text-lg">{choice.title}</span>
                        <span className="font-mono text-xs tabular-nums text-ink-muted">
                          {s.version(choice.version)} ·{" "}
                          {s.catalogueSize(choice.line_count, choice.supplier_count)}
                        </span>
                      </div>
                      {inUse ? (
                        <Badge tone="accent">
                          <Icon name="check" size={12} />
                          {s.inUse}
                        </Badge>
                      ) : (
                        <form
                          action={pinCatalogueAction.bind(
                            null,
                            id,
                            choice.id,
                            choice.version,
                          )}
                        >
                          <Button variant="secondary" size="sm" type="submit">
                            {s.use}
                          </Button>
                        </form>
                      )}
                    </Card>
                  );
                })}
              </ul>
              <p className="max-w-prose text-sm text-ink-muted">{s.pinNote}</p>
              {pinned !== null ? (
                <div className="flex flex-col gap-3 border-t border-rule-line pt-4">
                  <p className="max-w-prose text-sm text-ink-muted">{s.turnOffNote}</p>
                  <form action={unpinCatalogueAction.bind(null, id)}>
                    <Button variant="secondary" size="sm" type="submit">
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
              <SectionHeading
                id="shortlists"
                title={s.shortlistsHeading}
                description={s.shortlistsIntro}
              />
              {shortlists.length === 0 ? (
                <EmptyState icon="layers" body={strings.course.empty} />
              ) : (
                <ul className="flex flex-col gap-3">
                  {shortlists.map(({ entry, count }) => (
                    <Card
                      key={entry.id}
                      as="li"
                      tone="flat"
                      padded={false}
                      className="flex flex-wrap items-center justify-between gap-4 px-5 py-4"
                    >
                      <div className="flex flex-col gap-1">
                        <span className="font-display text-lg">{entry.title}</span>
                        <span className="text-sm tabular-nums text-ink-muted">
                          {s.shortlisted(count)}
                        </span>
                      </div>
                      <ButtonLink
                        href={`/courses/${id}/case-studies/${entry.id}/shortlist`}
                        variant="secondary"
                        size="sm"
                      >
                        <Icon name="pen" size={14} />
                        {s.editShortlist}
                      </ButtonLink>
                    </Card>
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby="quotes" className="flex flex-col gap-4">
              <SectionHeading id="quotes" title={s.quotesHeading} description={s.quotesIntro} />

              {cases.length > 0 ? (
                <SegmentedNav
                  label={s.quotesHeading}
                  segments={[
                    {
                      href: `/courses/${id}/materials`,
                      label: s.everyCaseStudy,
                      current: caseFilter === undefined,
                    },
                    ...cases.map((entry) => ({
                      href: `/courses/${id}/materials?case_study=${entry.id}`,
                      label: entry.title,
                      current: caseFilter === entry.id,
                    })),
                  ]}
                />
              ) : null}

              {!quotes?.ok ? (
                <p role="alert" className="text-sm text-flag-amber">
                  {s.error}
                </p>
              ) : quotes.data.entries.length === 0 ? (
                <EmptyState icon="inbox" body={s.quotesEmpty} />
              ) : (
                <>
                  <Table>
                    <thead>
                      <tr>
                        <Th>{s.colQuote}</Th>
                        <Th>{s.colSeat}</Th>
                        <Th justify="end">{s.colLines}</Th>
                        <Th justify="end">{s.colTotal}</Th>
                        <Th justify="end">{s.colMass}</Th>
                        <Th>{s.colCited}</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {quotes.data.entries.map((entry) => (
                        <Tr key={entry.quote_id}>
                          <Td>
                            <span className="font-mono text-xs tabular-nums">
                              {entry.quote_number}
                            </span>
                            <span className="block text-xs text-ink-muted">
                              {titles.get(entry.case_study_id) ?? ""}{" "}
                              <span className="font-mono tabular-nums">
                                {new Date(entry.issued_at * 1000).toISOString().slice(0, 10)}
                              </span>
                            </span>
                          </Td>
                          <Td numeric className="text-xs">
                            {entry.seat_number}
                          </Td>
                          <Td numeric justify="end">
                            {entry.line_count}
                          </Td>
                          <Td numeric justify="end">
                            {money(entry.total_cents)}
                          </Td>
                          <Td numeric justify="end">
                            {mass(entry.total_mass_grams)}
                          </Td>
                          <Td>
                            <Badge tone={entry.cited ? "accent" : "neutral"}>
                              {entry.cited ? s.cited : s.notCited}
                            </Badge>
                          </Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                  {quotes.data.next_cursor !== null ? (
                    <div>
                      <ButtonLink
                        href={`/courses/${id}/materials?${new URLSearchParams({
                          ...(caseFilter === undefined
                            ? {}
                            : { case_study: String(caseFilter) }),
                          cursor: String(quotes.data.next_cursor),
                        })}`}
                        variant="secondary"
                        size="sm"
                      >
                        {s.older}
                        <Icon name="arrow-right" size={14} />
                      </ButtonLink>
                    </div>
                  ) : null}
                </>
              )}

              {quotes?.ok && quotes.data.tallies.length > 0 ? (
                <div className="flex flex-col gap-3 border-t border-rule-line pt-6">
                  <SectionHeading
                    level={3}
                    rule={false}
                    title={s.talliesHeading}
                    description={s.talliesIntro}
                  />
                  <ul className="flex flex-col divide-y divide-rule-line">
                    {quotes.data.tallies.map((tally) => (
                      <li
                        key={tally.sku}
                        className="flex flex-wrap items-baseline justify-between gap-3 py-2.5"
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
