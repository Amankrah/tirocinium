import Link from "next/link";
import { notFound } from "next/navigation";

import { getMarketplace, listLines, listQuotes, getQuote } from "@/lib/api/marketplace";
import { money } from "@/lib/money";
import { requireSeat } from "@/lib/seat-session";
import { StudentShell } from "../../../student-shell";
import { strings } from "../../../strings";
import {
  compareLinesAction,
  discardQuoteAction,
  issueQuoteAction,
  listLinesAction,
  saveQuoteAction,
  submitRfqAction,
} from "./actions";
import { MarketplaceBrowser } from "./marketplace-browser";

// The student's marketplace (Phase 10, decision 0062). A Server Component
// shell: it proves the seat, resolves the variant whose seed the prices are
// struck from, renders the supplier directory and the professor's shortlist,
// and hands the browser its authed actions along with the first page of lines
// so the grid is there on first paint.
//
// A course that does not price materials answers 409 on the front door. That
// is not an error state and it does not get one: the student simply should not
// be here, so it is a 404 the same way an unpublished case study is.
export default async function MarketplacePage({
  params,
  searchParams,
}: {
  params: Promise<{ caseStudyId: string }>;
  searchParams: Promise<{ variant?: string; quote?: string }>;
}) {
  const { token, seat } = await requireSeat();
  const { caseStudyId } = await params;
  const { variant, quote } = await searchParams;

  const caseId = Number(caseStudyId);
  const variantId = Number(variant);
  if (!Number.isInteger(caseId) || caseId <= 0) notFound();
  if (!Number.isInteger(variantId) || variantId <= 0) notFound();

  const front = await getMarketplace(token, variantId);
  if (!front.ok) {
    if (front.status === 0) throw new Error(strings.marketplace.offline);
    notFound();
  }
  const market = front.data;
  const s = strings.marketplace;

  const [firstPage, existing] = await Promise.all([
    listLines(token, variantId, { limit: 24 }),
    listQuotes(token, variantId),
  ]);

  // The basket the student comes back to: an explicitly named quotation, else
  // the newest draft. An issued quotation is never resumed as a basket, which
  // is the whole point of issuing one.
  const named = Number(quote);
  const resume =
    Number.isInteger(named) && named > 0
      ? named
      : existing.ok
        ? (existing.data.items.find((item) => item.status === "draft")?.id ?? null)
        : null;
  const opened = resume === null ? null : await getQuote(token, resume);

  return (
    <StudentShell seatNumber={seat.seat_number}>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-12">
        <Link
          href={`/course/${caseId}`}
          className="text-sm text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {s.back}
        </Link>

        <header className="flex flex-col gap-3">
          <h1 className="font-display text-4xl">{s.title}</h1>
          <p className="max-w-[var(--measure-reading)] text-sm text-ink-muted">
            {s.yourPrices}
          </p>
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

        {market.brief ? (
          <section
            aria-labelledby="brief"
            className="flex flex-col gap-2 rounded-lg border border-rule-line p-4"
          >
            <h2 id="brief" className="font-display text-lg">
              {s.briefFactors}
            </h2>
            <ul className="flex flex-col gap-1 text-sm text-ink-muted">
              {market.brief.selection_factors.map((factor) => (
                <li key={factor}>{factor}</li>
              ))}
            </ul>
          </section>
        ) : null}

        <MarketplaceBrowser
          variantId={variantId}
          caseStudyId={caseId}
          categories={market.categories}
          suppliers={market.suppliers.map((entry) => ({
            id: entry.supplier.id,
            name: entry.supplier.name,
          }))}
          shortlist={market.shortlist}
          initialLines={firstPage.ok ? firstPage.data : { items: [], next_cursor: null, total: 0 }}
          initialQuote={opened?.ok ? opened.data : null}
          validityDays={market.quote_validity_days}
          browse={listLinesAction}
          compare={compareLinesAction}
          save={saveQuoteAction}
          issue={issueQuoteAction}
          discard={discardQuoteAction}
          ask={submitRfqAction}
        />
      </div>
    </StudentShell>
  );
}
