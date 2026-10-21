import Link from "next/link";

import { getProjectMarketplace, listProjectLines } from "@/lib/api/marketplace";
import { money } from "@/lib/money";
import { requireSeat } from "@/lib/seat-session";
import { StudentShell } from "../student-shell";
import { strings } from "../strings";
import { askAction, browseAction, compareAction, priceAction } from "./actions";
import { ProjectMarketplace } from "./project-marketplace";

// The project marketplace (decision 0100). A Server Component shell: it proves
// the seat, reads the catalogue at list prices, and renders the supplier
// directory and the project briefs as plain HTML (native disclosures, no
// script), handing the working surface its actions and the first page of
// lines so the grid is there on first paint.
//
// Any seat reaches it, whatever its course and whether or not that course
// prices materials: a project is not a case study. Everything except the
// printed quotation is hidden from the printer.
export default async function ProjectMarketplacePage() {
  const { token, seat } = await requireSeat();
  const s = strings.marketplace;
  const p = strings.project;

  const [front, firstPage] = await Promise.all([
    getProjectMarketplace(token),
    listProjectLines(token, { limit: 24 }),
  ]);
  if (!front.ok) throw new Error(s.offline);
  const market = front.data;
  const basis = p.basis(market.title, market.catalogue_version);

  return (
    <StudentShell seatNumber={seat.seat_number} section="marketplace">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-12 print:max-w-none print:p-0">
        <div className="flex flex-col gap-8 print:hidden">
          <Link
            href="/course"
            className="self-start text-sm text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {p.back}
          </Link>

          <header className="flex flex-col gap-3">
            <h1 className="font-display text-4xl">{p.title}</h1>
            <p className="max-w-[var(--measure-reading)] text-sm text-ink-muted">{p.lede}</p>
            <p className="font-mono text-xs text-ink-muted">{basis}</p>
          </header>

          <section aria-labelledby="suppliers" className="flex flex-col gap-4">
            <h2 id="suppliers" className="font-display text-2xl">
              {s.suppliers}
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {market.suppliers.map((entry) => (
                <li
                  key={entry.supplier.id}
                  className="flex flex-col gap-1.5 rounded-lg border border-rule-line p-4"
                >
                  <span className="font-display text-lg">{entry.supplier.name}</span>
                  <span className="text-sm text-ink-muted">{entry.supplier.tagline}</span>
                  <span className="text-sm text-ink-muted">{entry.supplier.city}</span>
                  <span className="mt-1 font-mono text-xs tabular-nums text-ink-muted">
                    {s.supplierLines(entry.line_count)} ·{" "}
                    {s.fromPrice(money(entry.from_price_cents))}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {market.briefs.length > 0 ? (
            <section aria-labelledby="briefs" className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <h2 id="briefs" className="font-display text-2xl">
                  {p.briefs}
                </h2>
                <p className="text-sm text-ink-muted">{p.briefsHint}</p>
              </div>
              <ul className="flex flex-col divide-y divide-rule-line rounded-lg border border-rule-line">
                {market.briefs.map((brief) => (
                  <li key={brief.id}>
                    <details className="group px-4 py-3">
                      <summary className="cursor-pointer font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                        {brief.title}
                      </summary>
                      <div className="mt-3 flex flex-col gap-3 text-sm">
                        <div className="flex flex-col gap-1">
                          <h3 className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                            {p.briefFactors}
                          </h3>
                          <ul className="flex list-disc flex-col gap-1 pl-5 text-ink-muted">
                            {brief.selection_factors.map((factor) => (
                              <li key={factor}>{factor}</li>
                            ))}
                          </ul>
                        </div>
                        <div className="flex flex-col gap-1">
                          <h3 className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                            {p.briefFamilies}
                          </h3>
                          <p className="text-ink-muted">{brief.candidate_families}</p>
                        </div>
                        {brief.shortlist.length > 0 ? (
                          <div className="flex flex-col gap-1">
                            <h3 className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                              {p.briefShortlist}
                            </h3>
                            <p className="font-mono text-xs text-ink-muted">
                              {brief.shortlist.join(" · ")}
                            </p>
                          </div>
                        ) : null}
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <ProjectMarketplace
          basis={basis}
          categories={market.categories}
          suppliers={market.suppliers.map((entry) => ({
            id: entry.supplier.id,
            name: entry.supplier.name,
          }))}
          initialLines={firstPage.ok ? firstPage.data : { items: [], next_cursor: null, total: 0 }}
          browse={browseAction}
          compare={compareAction}
          price={priceAction}
          ask={askAction}
        />
      </main>
    </StudentShell>
  );
}
