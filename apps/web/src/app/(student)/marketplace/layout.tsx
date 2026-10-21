import Link from "next/link";
import type { ReactNode } from "react";

import { Icon } from "@/components/ui/icon";
import { getProjectMarketplace } from "@/lib/api/marketplace";
import { requireSeat } from "@/lib/seat-session";
import { StudentShell } from "../student-shell";
import { strings } from "../strings";
import { priceAction } from "./actions";
import { CompareTray, QuoteLink } from "./_kit/controls";
import { MarketNav } from "./_kit/market-nav";
import { MarketProvider } from "./_kit/market-state";

// The project marketplace's frame (decisions 0100, 0101, restyled in 0105).
// The layout holds what has to outlive a navigation, the basket, its
// quotation and the comparison tray, so a student can move between a
// supplier, a line, a brief and the quote without losing anything.
//
// The frame is a masthead and a strip. The masthead names the place, carries
// the search (the way most students reach a line) and the quote. The strip
// is the five sections with the current one marked; suppliers are not in it,
// because six names in a row of links was the jumble, and the front page's
// directory and each store's switcher are where a supplier is chosen. The
// terms (currency, taxes, validity, the fictional catalogue) are a footer
// line: true on every page, and nothing a student acts on. None of it
// reaches the printer.
export default async function MarketplaceLayout({ children }: { children: ReactNode }) {
  const { token, seat } = await requireSeat();
  const s = strings.marketplace;
  const p = strings.project;
  const front = await getProjectMarketplace(token);
  if (!front.ok) throw new Error(s.offline);
  const market = front.data;
  const taxes = market.taxes.map((tax) => p.tax(tax.code, tax.rate * 100)).join(" + ");
  const terms = [p.currency(market.currency), taxes, p.validity(market.quote_validity_days), p.fictional];

  return (
    <StudentShell seatNumber={seat.seat_number} section="marketplace">
      <MarketProvider price={priceAction}>
        <div className="border-b border-rule-line bg-surface/60 print:hidden">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 pt-4 pb-1 sm:px-6">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <Link
                href="/marketplace"
                className="font-display text-2xl leading-none tracking-tight text-ink focus-ring rounded-sm"
              >
                {p.nav}
              </Link>
              <form
                action="/marketplace/search"
                role="search"
                className="relative flex min-w-0 flex-1 basis-64 items-center"
              >
                <label className="sr-only" htmlFor="marketplace-search">
                  {s.search}
                </label>
                <Icon
                  name="search"
                  size={16}
                  className="pointer-events-none absolute left-3 text-ink-muted"
                />
                <input
                  id="marketplace-search"
                  name="q"
                  type="search"
                  placeholder={p.searchPlaceholder}
                  enterKeyHint="search"
                  className="w-full min-w-0 rounded-md border border-field-border bg-surface py-2 pr-3 pl-9 text-sm text-ink placeholder:text-ink-muted/70 transition-[border-color] duration-(--motion-duration) ease-(--motion-ease) hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                />
              </form>
              <QuoteLink />
            </div>
            <MarketNav />
          </div>
        </div>
        <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 pt-8 pb-32 sm:px-6 print:max-w-none print:p-0">
          {children}
        </main>
        <footer className="border-t border-rule-line print:hidden">
          <p className="mx-auto flex w-full max-w-6xl flex-wrap gap-x-5 gap-y-1 px-4 py-4 font-mono text-xs text-ink-muted sm:px-6">
            {terms.map((term) => (
              <span key={term}>{term}</span>
            ))}
          </p>
        </footer>
        <CompareTray />
      </MarketProvider>
    </StudentShell>
  );
}
