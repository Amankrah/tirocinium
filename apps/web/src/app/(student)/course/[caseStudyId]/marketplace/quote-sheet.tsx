"use client";

// The quotation the student is building, and then the one they issued
// (decision 0076). The lines and totals are the shared QuoteBody, the same one
// the project marketplace prints; what is this surface's own is the number,
// the validity, and the verbs that make a basket a record.
//
// Once issued, the sheet stops being editable and starts being a record. The
// number and the validity are what make it an artifact worth citing, so they
// lead.
import { Button } from "@/components/ui/button";
import type { Quote } from "@/lib/api/marketplace";
import { QuoteBody } from "../../../_marketplace/quote-body";
import { strings } from "../../../strings";

const DAY = new Intl.DateTimeFormat("en-CA", {
  dateStyle: "long",
  timeZone: "UTC",
});

export function QuoteSheet({
  quote,
  pending,
  onQuantity,
  onCut,
  onRemove,
  onIssue,
  onDiscard,
  onStartAnother,
}: {
  quote: Quote | null;
  pending: boolean;
  onQuantity: (sku: string, quantity: number) => void;
  onCut: (sku: string, cutToLength: boolean) => void;
  onRemove: (sku: string) => void;
  onIssue: () => void;
  onDiscard: () => void;
  onStartAnother: () => void;
}) {
  const s = strings.marketplace.quote;
  const issued = quote?.status === "issued";

  if (!quote || quote.lines.length === 0) {
    return (
      <aside
        aria-labelledby="quote-heading"
        className="flex flex-col gap-3 rounded-lg border border-rule-line p-4"
      >
        <h2 id="quote-heading" className="font-display text-xl">
          {s.heading}
        </h2>
        <p className="text-sm text-ink-muted">{s.empty}</p>
      </aside>
    );
  }

  return (
    <aside
      aria-labelledby="quote-heading"
      className="flex flex-col gap-4 rounded-lg border border-rule-line p-4"
    >
      <header className="flex flex-col gap-1">
        <h2 id="quote-heading" className="font-display text-xl">
          {issued && quote.quote_number ? s.issued(quote.quote_number) : s.heading}
        </h2>
        {issued && quote.valid_until !== null ? (
          <p className="font-mono text-xs tabular-nums text-ink-muted">
            {s.validUntil(DAY.format(new Date(quote.valid_until * 1000)))}
          </p>
        ) : null}
      </header>

      <QuoteBody
        lines={quote.lines}
        totals={quote.totals}
        notices={quote.notices}
        editable={!issued}
        onQuantity={onQuantity}
        onCut={onCut}
        onRemove={onRemove}
      />

      {issued ? (
        <div className="flex flex-col gap-3 border-t border-rule-line pt-3">
          <p className="text-sm text-ink-muted">{s.frozen}</p>
          <Button variant="quiet" onClick={onStartAnother}>
            {s.startAnother}
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3 border-t border-rule-line pt-3">
          <Button onClick={onIssue} disabled={pending}>
            {pending ? s.issuing : s.issue}
          </Button>
          <Button variant="quiet" onClick={onDiscard} disabled={pending}>
            {s.discard}
          </Button>
        </div>
      )}
    </aside>
  );
}
