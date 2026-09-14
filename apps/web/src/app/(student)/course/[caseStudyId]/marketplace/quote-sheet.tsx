"use client";

// The quotation the student is building, and then the one they issued
// (decision 0062). Every figure on it comes from the server: the component
// holds the quantities a student typed and nothing else, because a total the
// client worked out is a total they could not defend.
//
// Once issued, the sheet stops being editable and starts being a record. The
// number and the validity are what make it an artifact worth citing, so they
// lead.
import { Button } from "@/components/ui/button";
import type { Quote } from "@/lib/api/marketplace";
import { lead, mass, money } from "@/lib/money";
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

  const totals = quote.totals;

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

      <ul className="flex flex-col divide-y divide-rule-line">
        {quote.lines.map((line) => (
          <li key={line.sku} className="flex flex-col gap-2 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-medium">{line.name}</span>
              <span className="font-mono text-sm tabular-nums">
                {money(line.extended_cents)}
              </span>
            </div>
            <span className="text-xs text-ink-muted">{line.spec}</span>

            {issued ? (
              <span className="font-mono text-xs tabular-nums text-ink-muted">
                {line.quantity} {line.unit_label} · {money(line.unit_price_cents)}
                {line.break_percent > 0 ? ` · −${line.break_percent} %` : ""}
              </span>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-xs text-ink-muted">
                  <span className="sr-only">{s.quantity(line.unit_label)}</span>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    defaultValue={line.quantity}
                    aria-label={s.quantity(line.unit_label)}
                    onBlur={(event) => {
                      const next = Number(event.currentTarget.value);
                      if (next > 0 && next !== line.quantity) {
                        onQuantity(line.sku, next);
                      }
                    }}
                    className="w-20 rounded-md border border-rule-line bg-transparent px-2 py-1 font-mono tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  />
                  <span>{line.unit_label}</span>
                </label>

                {line.cut_fee_cents > 0 || line.cut_to_length ? (
                  <label className="flex items-center gap-2 text-xs text-ink-muted">
                    <input
                      type="checkbox"
                      checked={line.cut_to_length}
                      onChange={(event) => onCut(line.sku, event.currentTarget.checked)}
                      className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    />
                    {s.cutToLength}
                  </label>
                ) : null}

                <button
                  type="button"
                  onClick={() => onRemove(line.sku)}
                  className="text-xs text-ink-muted underline hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  {s.remove(line.name)}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {quote.notices.length > 0 ? (
        <section aria-label={s.notices} className="flex flex-col gap-1">
          <h3 className="text-xs font-medium uppercase tracking-wide text-ink-muted">
            {s.notices}
          </h3>
          <ul className="flex flex-col gap-1 text-xs text-ink-muted">
            {quote.notices.map((notice) => (
              <li key={notice}>{notice}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <dl className="flex flex-col gap-1 border-t border-rule-line pt-3 font-mono text-sm tabular-nums">
        <Row label={s.goods} value={money(totals.goods_cents)} />
        {totals.discount_cents > 0 ? (
          <Row label={s.discount} value={`−${money(totals.discount_cents)}`} />
        ) : null}
        {totals.cut_fee_cents > 0 ? (
          <Row label={s.cutting} value={money(totals.cut_fee_cents)} />
        ) : null}
        <Row label={s.freight} value={money(totals.freight_cents)} />
        {totals.taxes.map((tax) => (
          <Row key={tax.code} label={tax.code} value={money(tax.amount_cents)} />
        ))}
        <Row label={s.total} value={money(totals.total_cents)} emphatic />
      </dl>

      <dl className="flex flex-col gap-1 text-xs text-ink-muted">
        <Row label={s.totalMass} value={mass(totals.total_mass_grams)} />
        <Row label={s.longestLead} value={lead(totals.longest_lead_days)} />
        <Row
          label={s.costPerKilo}
          value={
            totals.cost_per_kg_cents === null
              ? s.costPerKiloUnknown
              : `${money(totals.cost_per_kg_cents)}/kg`
          }
        />
      </dl>

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

function Row({
  label,
  value,
  emphatic = false,
}: {
  label: string;
  value: string;
  emphatic?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-4 ${
        emphatic ? "border-t border-rule-line pt-1 font-medium text-ink" : ""
      }`}
    >
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
