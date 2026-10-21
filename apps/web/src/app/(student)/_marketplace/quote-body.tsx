"use client";

// The body of a quotation, shared by both marketplaces (decisions 0076 and
// 0100): its lines, the server's notices about them, and the totals. Every
// figure comes from the server; the component holds the quantities a student
// typed and nothing else, because a total the client worked out is a total
// they could not account for.
//
// Editable while the student is building it, fixed once it is a record: an
// issued case-study quotation, or a project quotation on paper.
import type { Quote } from "@/lib/api/marketplace";
import { lead, mass, money } from "@/lib/money";
import { strings } from "../strings";

// How far one press of − or + moves a quantity: a piece or an hour at a time,
// five kilograms at a time, one of anything else.
function step(unit: string): number {
  return unit === "kg" ? 5 : 1;
}

const STEPPER =
  "inline-flex min-h-6 min-w-6 items-center justify-center rounded border border-rule-line " +
  "font-mono text-sm hover:bg-rule-line/40 " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export function QuoteBody({
  lines,
  totals,
  notices,
  editable,
  onQuantity,
  onCut,
  onCuts,
  onRemove,
}: {
  lines: Quote["lines"];
  totals: Quote["totals"];
  notices: string[];
  editable: boolean;
  onQuantity?: (sku: string, quantity: number) => void;
  onCut?: (sku: string, cutToLength: boolean) => void;
  // How many cuts, when a surface lets the student say; without it a cut
  // line is priced at one cut, as the case-study quote always has.
  onCuts?: (sku: string, cuts: number) => void;
  onRemove?: (sku: string) => void;
}) {
  const s = strings.marketplace.quote;
  return (
    <>
      <ul className="flex flex-col divide-y divide-rule-line">
        {lines.map((line) => (
          <li key={line.sku} className="flex flex-col gap-2 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-medium">{line.name}</span>
              <span className="font-mono text-sm tabular-nums">
                {money(line.extended_cents)}
              </span>
            </div>
            <span className="text-xs text-ink-muted">
              {line.spec} · {line.sku}
            </span>

            {!editable ? (
              <span className="font-mono text-xs tabular-nums text-ink-muted">
                {line.quantity} {line.unit_label} · {money(line.unit_price_cents)}
                {line.break_percent > 0 ? ` · −${line.break_percent} %` : ""}
                {line.cut_to_length ? ` · ${s.cutsFixed(line.cut_count)}` : ""}
              </span>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1 text-xs text-ink-muted">
                <button
                  type="button"
                  aria-label={s.less(line.name)}
                  disabled={line.quantity - step(line.unit) <= 0}
                  onClick={() => onQuantity?.(line.sku, line.quantity - step(line.unit))}
                  className={STEPPER}
                >
                  −
                </button>
                <label className="flex items-center gap-2">
                  <span className="sr-only">{s.quantity(line.unit_label)}</span>
                  <input
                    // Keyed on the priced quantity, so a figure the server
                    // raised to a minimum order replaces what was typed.
                    key={`${line.sku}-${line.quantity}`}
                    type="number"
                    min={0}
                    step="any"
                    defaultValue={line.quantity}
                    aria-label={s.quantity(line.unit_label)}
                    onBlur={(event) => {
                      const next = Number(event.currentTarget.value);
                      if (next > 0 && next !== line.quantity) {
                        onQuantity?.(line.sku, next);
                      }
                    }}
                    className="w-20 rounded-md border border-rule-line bg-transparent px-2 py-1 font-mono tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  />
                  <span>{line.unit_label}</span>
                </label>
                <button
                  type="button"
                  aria-label={s.more(line.name)}
                  onClick={() => onQuantity?.(line.sku, line.quantity + step(line.unit))}
                  className={STEPPER}
                >
                  +
                </button>
                </div>

                {line.cut_fee_cents > 0 || line.cut_to_length ? (
                  <label className="flex items-center gap-2 text-xs text-ink-muted">
                    <input
                      type="checkbox"
                      checked={line.cut_to_length}
                      onChange={(event) => onCut?.(line.sku, event.currentTarget.checked)}
                      className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    />
                    {s.cutToLength}
                  </label>
                ) : null}

                {line.cut_to_length && onCuts ? (
                  <label className="flex items-center gap-2 text-xs text-ink-muted">
                    {s.cuts}
                    <input
                      key={`${line.sku}-cuts-${line.cut_count}`}
                      type="number"
                      min={1}
                      step={1}
                      defaultValue={line.cut_count}
                      onBlur={(event) => {
                        const next = Math.round(Number(event.currentTarget.value));
                        if (next >= 1 && next !== line.cut_count) onCuts(line.sku, next);
                      }}
                      className="w-14 rounded-md border border-rule-line bg-transparent px-2 py-1 font-mono tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    />
                  </label>
                ) : null}

                <button
                  type="button"
                  onClick={() => onRemove?.(line.sku)}
                  className="text-xs text-ink-muted underline hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  {s.remove(line.name)}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {notices.length > 0 ? (
        <section aria-label={s.notices} className="flex flex-col gap-1">
          <h3 className="text-xs font-medium uppercase tracking-wide text-ink-muted">
            {s.notices}
          </h3>
          <ul className="flex flex-col gap-1 text-xs text-ink-muted">
            {notices.map((notice) => (
              <li key={notice}>{notice}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <dl className="flex flex-col gap-1 border-t border-rule-line pt-3 font-mono text-sm tabular-nums">
        {/* The server's goods figure already has the volume discount taken
            off and the cutting charges added, so the rows below show it in
            those parts: materials net of discount, then cutting. The
            discount is stated as already applied, never as a further line to
            subtract, or a student adding the column up counts it twice. */}
        <Row label={s.goods} value={money(totals.goods_cents - totals.cut_fee_cents)} />
        {totals.discount_cents > 0 ? (
          <Row label={s.discount} value={`−${money(totals.discount_cents)}`} muted />
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
    </>
  );
}

function Row({
  label,
  value,
  emphatic = false,
  muted = false,
}: {
  label: string;
  value: string;
  emphatic?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-4 ${
        emphatic ? "border-t border-rule-line pt-1 font-medium text-ink" : ""
      } ${muted ? "text-xs text-ink-muted" : ""}`}
    >
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
