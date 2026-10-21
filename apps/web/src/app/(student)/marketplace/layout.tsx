import Link from "next/link";
import type { ReactNode } from "react";

import { getProjectMarketplace } from "@/lib/api/marketplace";
import { requireSeat } from "@/lib/seat-session";
import { StudentShell } from "../student-shell";
import { strings } from "../strings";
import { priceAction } from "./actions";
import { CompareTray, QuoteLink } from "./_kit/controls";
import { MarketProvider } from "./_kit/market-state";

// The project marketplace's frame (decisions 0100 and 0101). The layout holds
// what has to outlive a navigation, the basket, its quotation and the
// comparison tray, so a student can move between a supplier, a line, a brief
// and the quote without losing anything. The terms line and the marketplace's
// own navigation are server-rendered; the quote count and the tray are the
// only script up here. None of it reaches the printer.

const NAV =
  "inline-flex min-h-6 items-center rounded-md px-2 py-1 text-sm text-ink-muted " +
  "hover:text-ink hover:underline underline-offset-4 " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export default async function MarketplaceLayout({ children }: { children: ReactNode }) {
  const { token, seat } = await requireSeat();
  const s = strings.marketplace;
  const p = strings.project;
  const front = await getProjectMarketplace(token);
  if (!front.ok) throw new Error(s.offline);
  const market = front.data;
  const taxes = market.taxes.map((tax) => p.tax(tax.code, tax.rate * 100)).join(" + ");

  return (
    <StudentShell seatNumber={seat.seat_number} section="marketplace">
      <MarketProvider price={priceAction}>
        <div className="border-b border-rule-line print:hidden">
          <p className="mx-auto flex w-full max-w-6xl flex-wrap gap-x-4 gap-y-1 px-4 py-2 font-mono text-xs text-ink-muted sm:px-6">
            <span>{p.currency(market.currency)}</span>
            <span>{taxes}</span>
            <span>{p.validity(market.quote_validity_days)}</span>
            <span>{p.fictional}</span>
          </p>
          {/* One row that scrolls sideways on a phone, where wrapping put
              nine rows of links above the first word of content; it wraps
              from large screens up. Search and the quote sit on their own
              row so they are always in reach. */}
          <nav
            aria-label={p.nav}
            className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-2 pb-2 sm:px-4 lg:flex-row lg:items-center"
          >
            <ul className="flex flex-nowrap items-center gap-x-1 overflow-x-auto whitespace-nowrap lg:flex-1 lg:flex-wrap lg:gap-y-1 lg:overflow-visible lg:whitespace-normal">
              <li>
                <Link href="/marketplace" className={NAV}>
                  {p.home}
                </Link>
              </li>
              {market.suppliers.map((entry) => (
                <li key={entry.supplier.id}>
                  <Link href={`/marketplace/store/${entry.supplier.id}`} className={NAV}>
                    {entry.supplier.name}
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/marketplace/briefs" className={NAV}>
                  {p.briefs}
                </Link>
              </li>
              <li>
                <Link href="/marketplace/guide" className={NAV}>
                  {p.guide}
                </Link>
              </li>
              <li>
                <Link href="/marketplace/sources" className={NAV}>
                  {p.sources}
                </Link>
              </li>
              <li>
                <Link href="/marketplace/request" className={NAV}>
                  {p.request}
                </Link>
              </li>
            </ul>
            <div className="flex items-center gap-2 px-2">
              <form action="/marketplace/search" role="search" className="flex flex-1 items-center">
                <label className="sr-only" htmlFor="marketplace-search">
                  {s.search}
                </label>
                <input
                  id="marketplace-search"
                  name="q"
                  type="search"
                  placeholder={p.searchPlaceholder}
                  className="w-full min-w-0 rounded-md border border-field-border bg-transparent px-2 py-1 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent lg:w-56"
                />
              </form>
              <QuoteLink />
            </div>
          </nav>
        </div>
        <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 pt-8 pb-28 sm:px-6 print:max-w-none print:p-0">
          {children}
        </main>
        <CompareTray />
      </MarketProvider>
    </StudentShell>
  );
}
