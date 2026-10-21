"use client";

// The project marketplace's interactive pieces, each small enough to sit
// inside a server-rendered page (decision 0101, restyled in 0105): the pages
// are HTML, and only the verbs that touch the basket or the comparison tray
// are script.
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button, buttonClassName } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { strings } from "../../strings";
import { type Addable, useMarket } from "./market-state";

/** Add to quote, and put in the comparison tray, for one line. */
export function LineActions({ line, size = "card" }: { line: Addable; size?: "card" | "full" }) {
  const s = strings.marketplace;
  const p = strings.project;
  const market = useMarket();
  const added = market.inBasket(line.sku);
  const comparing = market.inTray(line.sku);
  const full = size === "full";
  return (
    <div className={full ? "flex flex-col gap-2" : "flex flex-wrap items-center gap-2"}>
      <Button
        onClick={() => market.add(line)}
        disabled={added}
        size={full ? "md" : "sm"}
        className={full ? "w-full" : ""}
      >
        {added ? <Icon name="check" size={14} /> : <Icon name="plus" size={14} />}
        {added ? s.added : s.add}
      </Button>
      <button
        type="button"
        aria-pressed={comparing}
        onClick={() => market.toggleTray(line.sku)}
        className={buttonClassName(
          comparing ? "secondary" : "quiet",
          (full ? "w-full " : "") + (comparing ? "border-accent/40 bg-accent-soft text-accent-text" : "text-ink-muted"),
          full ? "md" : "sm",
        )}
      >
        <Icon name="layers" size={14} />
        {comparing ? p.inTray : s.compare}
      </button>
    </div>
  );
}

/** The way to the quote, carrying how many lines it holds. */
export function QuoteLink() {
  const p = strings.project;
  const { basket } = useMarket();
  const count = basket.length;
  return (
    <Link
      href="/marketplace/quote"
      className={buttonClassName(count > 0 ? "primary" : "secondary", "shrink-0")}
    >
      <Icon name="file" size={15} />
      {p.quoteLink(count)}
    </Link>
  );
}

/** Load a set of lines into the tray and open the comparison. */
export function CompareSet({ skus, label }: { skus: string[]; label: string }) {
  const router = useRouter();
  const { setTray } = useMarket();
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={() => {
        setTray(skus);
        router.push("/marketplace/compare");
      }}
    >
      <Icon name="layers" size={14} />
      {label}
    </Button>
  );
}

/** Put every one of a set of lines in the quote. */
export function AddAll({ lines, label }: { lines: Addable[]; label: string }) {
  const { addMany } = useMarket();
  return (
    <Button onClick={() => addMany(lines)}>
      <Icon name="plus" size={14} />
      {label}
    </Button>
  );
}

/**
 * The comparison tray: what the student has ticked, kept in view at the foot
 * of every marketplace page until they compare it or clear it. A floating
 * sheet rather than a full-width bar, so the page beneath stays readable.
 */
export function CompareTray() {
  const s = strings.marketplace;
  const p = strings.project;
  const { tray, toggleTray, clearTray } = useMarket();
  if (tray.length === 0) return null;
  return (
    <aside
      aria-label={p.tray}
      className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 print:hidden"
    >
      <div className="pointer-events-auto flex w-full max-w-4xl flex-wrap items-center gap-3 rounded-xl border border-rule-line bg-surface px-4 py-3 shadow-floating">
        <span className="inline-flex items-center gap-1.5 text-sm font-medium">
          <Icon name="layers" size={15} className="text-ink-muted" />
          {p.tray}
        </span>
        <ul className="flex flex-1 flex-wrap gap-1.5">
          {tray.map((sku) => (
            <li
              key={sku}
              className="flex items-center gap-1 rounded-full border border-rule-line bg-surface-sunken py-0.5 pr-1 pl-2.5 font-mono text-xs"
            >
              {sku}
              <button
                type="button"
                onClick={() => toggleTray(sku)}
                aria-label={p.removeFromTray(sku)}
                className="inline-flex size-5 items-center justify-center rounded-full text-ink-muted hover:bg-rule-line hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <Icon name="x" size={12} />
              </button>
            </li>
          ))}
        </ul>
        <Link href="/marketplace/compare" className={buttonClassName("primary", "", "sm")}>
          {s.comparing(tray.length)}
          <Icon name="arrow-right" size={14} />
        </Link>
        <button type="button" onClick={clearTray} className={buttonClassName("quiet", "text-ink-muted", "sm")}>
          {s.clearComparison}
        </button>
      </div>
    </aside>
  );
}
