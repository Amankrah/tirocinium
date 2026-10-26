"use client";

// The body of a quotation, shared by both marketplaces (decisions 0076 and
// 0100, restyled in 0105): its lines, the server's notices about them, and
// the totals. Every figure comes from the server; the component holds the
// quantities a student typed and nothing else, because a total the client
// worked out is a total they could not account for.
//
// Editable while the student is building it, fixed once it is a record: an
// issued case-study quotation, or a project quotation on paper.
import { Button, buttonClassName } from "@/components/ui/button";
import { inputClassName } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import type { Quote } from "@/lib/api/marketplace";
import { lead, mass, money } from "@/lib/money";
import { strings } from "../strings";
import { impactQuantity } from "./impact-format";

// How far one press of − or + moves a quantity: a piece or an hour at a time,
// five kilograms at a time, one of anything else.
function step(unit: string): number {
  return unit === "kg" ? 5 : 1;
}

// A stepper button: the secondary button at its small size, squared up and in
// the mono face so the sign sits like a figure.
const STEPPER = buttonClassName("secondary", "min-w-8 px-0 font-mono", "sm");
const QUANTITY = inputClassName("w-20 px-2.5 py-1.5 text-sm font-mono tabular-nums");
const CUTS = inputClassName("w-14 px-2.5 py-1.5 text-sm font-mono tabular-nums");
const TICK =
  "size-4 shrink-0 accent-(--color-accent) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

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
        {lines.map((line) => {
          const pieces = line.pieces ?? [];
          return (
          <li key={line.sku} className="flex flex-col gap-2 py-4 first:pt-0">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-medium">{line.name}</span>
              <span className="font-mono text-sm tabular-nums">
                {money(line.extended_cents)}
              </span>
            </div>
            <span className="text-xs text-ink-muted">
              {line.spec} · <span className="font-mono">{line.sku}</span>
            </span>

            {pieces.length > 0 ? (
              // Ordered by the piece (decision 0114): the pieces are the
              // order, and the quantity is what the server said they come to.
              <span className="font-mono text-xs tabular-nums text-ink-muted">
                {pieces
                  .map((piece) => `${s.pieceLine(piece.count, piece.length_mm, piece.width_mm ?? null)} (${s.pieceEach(mass(piece.each_mass_grams))})`)
                  .join(" · ")}
                {` · ${line.quantity} ${line.unit_label} · ${money(line.unit_price_cents)}`}
                {line.break_percent > 0 ? ` · −${line.break_percent} %` : ""}
                {` · ${s.cutsFixed(line.cut_count)}`}
                {line.stock_lengths != null
                  ? ` · ${s.stockUsed(line.stock_lengths, pieces[0]?.width_mm != null ? "sheet" : "length", line.remnant_mm ?? null)}`
                  : ""}
                {line.tolerance_mm != null ? ` · ${s.tolerance(line.tolerance_mm)}` : ""}
              </span>
            ) : null}
            {pieces.length > 0 && editable ? (
              <div className="flex pt-1">
                <Button
                  variant="quiet"
                  size="sm"
                  className="ml-auto text-ink-muted"
                  onClick={() => onRemove?.(line.sku)}
                >
                  <Icon name="x" size={14} />
                  {s.remove(line.name)}
                </Button>
              </div>
            ) : pieces.length > 0 ? null : !editable ? (
              <span className="font-mono text-xs tabular-nums text-ink-muted">
                {line.quantity} {line.unit_label} · {money(line.unit_price_cents)}
                {line.break_percent > 0 ? ` · −${line.break_percent} %` : ""}
                {line.cut_to_length ? ` · ${s.cutsFixed(line.cut_count)}` : ""}
              </span>
            ) : (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
                <div className="flex items-center gap-1.5 text-xs text-ink-muted">
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
                      className={QUANTITY}
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
                      className={TICK}
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
                      className={CUTS}
                    />
                  </label>
                ) : null}

                <Button
                  variant="quiet"
                  size="sm"
                  className="ml-auto text-ink-muted"
                  onClick={() => onRemove?.(line.sku)}
                >
                  <Icon name="x" size={14} />
                  {s.remove(line.name)}
                </Button>
              </div>
            )}
          </li>
          );
        })}
      </ul>

      {notices.length > 0 ? (
        <section aria-label={s.notices} className="flex flex-col gap-1.5 rounded-lg bg-surface-sunken px-4 py-3">
          <h3 className="text-xs font-medium tracking-wide text-ink-muted uppercase">
            {s.notices}
          </h3>
          <ul className="flex flex-col gap-1 text-xs text-ink-muted">
            {notices.map((notice) => (
              <li key={notice}>{notice}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <dl className="flex flex-col divide-y divide-rule-line border-t border-rule-line font-mono text-sm tabular-nums">
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
        {totals.embodied_energy_mj != null ? (
          <Row label={s.embodiedEnergy} value={`${impactQuantity(totals.embodied_energy_mj, 1)} MJ`} />
        ) : null}
        {totals.carbon_kg != null ? (
          <Row label={s.carbon} value={`${impactQuantity(totals.carbon_kg, 2)} kg CO₂e`} />
        ) : null}
        {totals.water_l != null ? (
          <Row label={s.water} value={`${impactQuantity(totals.water_l, 0)} L`} />
        ) : null}
        {totals.freight_carbon_kg != null ? (
          <Row label={s.freightCarbon} value={`${impactQuantity(totals.freight_carbon_kg, 2)} kg CO₂e`} />
        ) : null}
        {totals.carbon_intensity_kg_per_kg != null ? (
          <Row
            label={s.carbonIntensity}
            value={`${impactQuantity(totals.carbon_intensity_kg_per_kg, 2)} kg CO₂e/kg`}
          />
        ) : null}
      </dl>
      {totals.carbon_kg != null ? (
        <p className="text-xs text-pretty text-ink-muted">{s.footprintNote}</p>
      ) : totals.embodied_energy_mj != null ? (
        <p className="text-xs text-pretty text-ink-muted">{s.energyNote}</p>
      ) : null}
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
      className={[
        "flex items-baseline justify-between gap-4 py-1.5",
        emphatic ? "font-medium text-ink" : "",
        muted ? "text-xs text-ink-muted" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <dt className={emphatic ? "" : "font-sans"}>{label}</dt>
      <dd className={["font-mono tabular-nums", emphatic ? "text-base" : ""].filter(Boolean).join(" ")}>{value}</dd>
    </div>
  );
}
