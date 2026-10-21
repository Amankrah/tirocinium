"use client";

// The project marketplace's interactive pieces, each small enough to sit
// inside a server-rendered page (decision 0101): the pages are HTML, and only
// the verbs that touch the basket or the comparison tray are script.
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button, buttonClassName } from "@/components/ui/button";
import { strings } from "../../strings";
import { type Addable, useMarket } from "./market-state";

const QUIET =
  "rounded-md px-2 py-1 text-xs text-ink-muted underline hover:text-ink " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

const LINK =
  "text-sm text-ink-muted hover:text-ink hover:underline underline-offset-4 " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/** Add to quote, and put in the comparison tray, for one line. */
export function LineActions({ line, size = "card" }: { line: Addable; size?: "card" | "full" }) {
  const s = strings.marketplace;
  const p = strings.project;
  const market = useMarket();
  const added = market.inBasket(line.sku);
  const comparing = market.inTray(line.sku);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        onClick={() => market.add(line)}
        disabled={added}
        className={size === "full" ? "flex-1" : "text-sm"}
      >
        {added ? s.added : s.add}
      </Button>
      <button
        type="button"
        aria-pressed={comparing}
        onClick={() => market.toggleTray(line.sku)}
        className={size === "full" ? `${QUIET} text-sm` : QUIET}
      >
        {comparing ? p.inTray : s.compare}
      </button>
    </div>
  );
}

/** The way to the quote, carrying how many lines it holds. */
export function QuoteLink() {
  const p = strings.project;
  const { basket } = useMarket();
  return (
    <Link href="/marketplace/quote" className={LINK}>
      {p.quoteLink(basket.length)}
    </Link>
  );
}

/** Load a set of lines into the tray and open the comparison. */
export function CompareSet({ skus, label }: { skus: string[]; label: string }) {
  const router = useRouter();
  const { setTray } = useMarket();
  return (
    <Button
      variant="quiet"
      onClick={() => {
        setTray(skus);
        router.push("/marketplace/compare");
      }}
    >
      {label}
    </Button>
  );
}

/** Put every one of a set of lines in the quote. */
export function AddAll({ lines, label }: { lines: Addable[]; label: string }) {
  const { addMany } = useMarket();
  return <Button onClick={() => addMany(lines)}>{label}</Button>;
}

/**
 * The comparison tray: what the student has ticked, kept in view at the foot
 * of every marketplace page until they compare it or clear it.
 */
export function CompareTray() {
  const s = strings.marketplace;
  const p = strings.project;
  const { tray, toggleTray, clearTray } = useMarket();
  if (tray.length === 0) return null;
  return (
    <aside
      aria-label={p.tray}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-rule-line bg-ground print:hidden"
    >
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
        <span className="text-sm font-medium">{p.tray}</span>
        <ul className="flex flex-1 flex-wrap gap-2">
          {tray.map((sku) => (
            <li
              key={sku}
              className="flex items-center gap-1 rounded-md border border-rule-line px-2 py-0.5 font-mono text-xs"
            >
              {sku}
              <button
                type="button"
                onClick={() => toggleTray(sku)}
                aria-label={p.removeFromTray(sku)}
                className="inline-flex min-h-6 min-w-6 items-center justify-center rounded text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        <Link href="/marketplace/compare" className={buttonClassName("primary", "px-3 py-1.5 text-sm")}>
          {s.comparing(tray.length)}
        </Link>
        <button type="button" onClick={clearTray} className={QUIET}>
          {s.clearComparison}
        </button>
      </div>
    </aside>
  );
}
