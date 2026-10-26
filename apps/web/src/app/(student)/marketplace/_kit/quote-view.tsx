"use client";

// The quote (decisions 0100 and 0101, restyled in 0105): edit the basket,
// then read it as the quotation that will print. Every figure is the server's
// pricing of the basket at list prices; nothing is kept, so printing (or
// saving as PDF) and copying as a table are how a student takes it into
// their report.
//
// On paper only the quotation sheet appears: the editor, the buttons and the
// whole marketplace frame are hidden from the printer.
import { useState } from "react";

import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import type { ProjectQuotation } from "@/lib/api/marketplace";
import { lead, mass, money } from "@/lib/money";
import { impactQuantity } from "../../_marketplace/impact-format";
import { QuoteBody } from "../../_marketplace/quote-body";
import { strings } from "../../strings";
import { TERMS } from "./content";
import { useMarket } from "./market-state";

const DAY = new Intl.DateTimeFormat("en-CA", { dateStyle: "long", timeZone: "UTC" });

type Supplier = { id: string; name: string; city: string };

export function QuoteView({
  title,
  basis,
  currency,
  suppliers,
}: {
  title: string;
  basis: string;
  currency: string;
  suppliers: Supplier[];
}) {
  const p = strings.project;
  const market = useMarket();
  const { quotation, basket } = market;
  const [copied, setCopied] = useState<string | null>(null);

  if (basket.length === 0) {
    return (
      <section className="flex flex-col gap-6">
        <h1 className="font-display text-4xl leading-[1.05]">{p.quotation}</h1>
        <EmptyState
          icon="file"
          body={p.emptyQuote}
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <ButtonLink href="/marketplace/briefs">
                {p.startFromBrief}
                <Icon name="arrow-right" size={16} />
              </ButtonLink>
              <ButtonLink href="/marketplace/search" variant="secondary">
                {p.browseEverything}
              </ButtonLink>
            </div>
          }
        />
      </section>
    );
  }

  async function copy(sheet: ProjectQuotation) {
    try {
      await navigator.clipboard.writeText(asTable(sheet, currency));
      setCopied(p.copied);
    } catch {
      setCopied(p.copyBlocked);
    }
  }

  return (
    <>
      <section aria-labelledby="editor" aria-busy={market.pending} className="flex flex-col gap-6 print:hidden">
        <div className="flex flex-col gap-3">
          <h1 id="editor" className="font-display text-4xl leading-[1.05]">
            {p.quotation}
          </h1>
          <p className="flex max-w-[var(--measure-reading)] items-start gap-2 text-sm text-ink-muted">
            <Icon name="lock" size={14} className="mt-0.5 shrink-0" />
            {p.notSaved}
          </p>
        </div>
        {market.failure ? (
          <p role="alert" className="text-sm text-flag-amber">
            {market.failure}
          </p>
        ) : null}
        {quotation ? (
          <Card as="div" className="flex max-w-2xl flex-col gap-5">
            <QuoteBody
              lines={quotation.lines}
              totals={quotation.totals}
              notices={quotation.notices}
              editable
              onQuantity={market.setQuantity}
              onCut={market.setCut}
              onCuts={market.setCuts}
              onRemove={market.remove}
            />
          </Card>
        ) : (
          <p className="text-sm text-ink-muted">{p.pricing}</p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => window.print()} disabled={!quotation || market.pending}>
            <Icon name="print" size={14} />
            {p.print}
          </Button>
          <Button
            variant="secondary"
            onClick={() => quotation && copy(quotation)}
            disabled={!quotation || market.pending}
          >
            {p.copyTable}
          </Button>
          <Button variant="quiet" className="text-ink-muted" onClick={market.clear} disabled={market.pending}>
            {p.clear}
          </Button>
          <p role="status" className="text-sm text-ink-muted">
            {copied}
          </p>
        </div>
      </section>

      {quotation && quotation.lines.length > 0 ? (
        <QuotationSheet
          quotation={quotation}
          title={title}
          basis={basis}
          currency={currency}
          suppliers={suppliers}
        />
      ) : null}
    </>
  );
}

// The quotation sheet's table, in the Table primitive's look (decision 0102)
// on a structure the kit test reads, so the classes are the primitive's and
// the elements stay a plain table.
const TH =
  "border-b border-rule-line bg-surface-sunken/60 px-3.5 py-2.5 text-xs font-medium tracking-wide text-ink-muted uppercase";
const TD = "border-b border-rule-line px-3.5 py-3 align-top";

/** The quotation as a document: what prints, and what a report cites. */
export function QuotationSheet({
  quotation,
  title,
  basis,
  currency,
  suppliers,
}: {
  quotation: ProjectQuotation;
  title: string;
  basis: string;
  currency: string;
  suppliers: Supplier[];
}) {
  const p = strings.project;
  const q = strings.marketplace.quote;
  const { totals } = quotation;
  const involved = suppliers.filter((supplier) =>
    quotation.lines.some((line) => line.supplier_id === supplier.id),
  );
  const num = `${TD} text-end font-mono tabular-nums`;

  return (
    <Card
      as="article"
      padded={false}
      aria-labelledby="sheet-reference"
      className="flex flex-col gap-6 p-6 text-sm sm:p-8 print:rounded-none print:border-0 print:p-0 print:shadow-none"
    >
      <header className="flex flex-wrap justify-between gap-6 border-b border-rule-line pb-5">
        <div className="flex flex-col gap-1.5">
          <p className="font-display text-2xl leading-tight">{title}</p>
          <p className="text-xs tracking-wide text-ink-muted uppercase">{p.consolidated}</p>
          <ul className="text-xs text-ink-muted">
            {involved.map((supplier) => (
              <li key={supplier.id}>
                {supplier.name}, {supplier.city}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col gap-0.5 text-end text-xs text-ink-muted">
          <h2 id="sheet-reference" className="font-mono text-base tabular-nums text-ink">
            {quotation.reference ? p.reference(quotation.reference) : p.quotation}
          </h2>
          <span className="font-mono tabular-nums">
            {p.prepared(DAY.format(new Date(quotation.prepared_at * 1000)))}
          </span>
          <span className="font-mono tabular-nums">
            {p.validUntil(DAY.format(new Date(quotation.valid_until * 1000)))}
          </span>
          <span>{p.currencyShort(currency)}</span>
          <span>{p.terms}</span>
        </div>
      </header>

      <div tabIndex={0} className="focus-ring overflow-x-auto rounded-lg border border-rule-line print:rounded-none print:border-0">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th scope="col" className={`${TH} text-start`}>{p.colItem}</th>
              <th scope="col" className={`${TH} text-start`}>{p.colDescription}</th>
              <th scope="col" className={`${TH} text-end`}>{p.colQuantity}</th>
              <th scope="col" className={`${TH} text-end`}>{p.unitPrice}</th>
              <th scope="col" className={`${TH} text-end`}>{p.colDiscount}</th>
              <th scope="col" className={`${TH} text-end`}>{p.colExtended}</th>
            </tr>
          </thead>
          <tbody>
            {quotation.lines.map((line) => (
              <tr key={line.sku}>
                <td className={`${TD} font-mono text-xs tabular-nums`}>{line.sku}</td>
                <td className={TD}>
                  <span className="font-medium">{line.name}</span>
                  <span className="block text-xs text-ink-muted">
                    {line.spec} · {line.supplier_name}
                    {line.cut_to_length ? ` · ${q.cutsFixed(line.cut_count)}` : ""}
                  </span>
                </td>
                <td className={num}>
                  {line.quantity} {line.unit_label}
                </td>
                <td className={num}>{money(line.unit_price_cents)}</td>
                <td className={num}>{line.break_percent > 0 ? `−${line.break_percent} %` : "None"}</td>
                <td className={num}>{money(line.extended_cents + line.cut_fee_cents)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-surface-sunken/40">
            {/* goods_cents is already net of discount and includes cutting. */}
            <SheetRow label={p.subtotal} value={money(totals.goods_cents)} strong />
            <SheetRow label={p.freightOn(mass(totals.total_mass_grams))} value={money(totals.freight_cents)} />
            {totals.taxes.map((tax) => (
              <SheetRow
                key={tax.code}
                label={p.tax(tax.code, tax.rate * 100)}
                value={money(tax.amount_cents)}
              />
            ))}
            <SheetRow label={p.grandTotal(currency)} value={money(totals.total_cents)} strong last />
          </tfoot>
        </table>
      </div>

      <dl className="grid grid-cols-2 divide-rule-line rounded-lg border border-rule-line sm:grid-cols-3 sm:divide-x lg:grid-cols-5 print:rounded-none">
        <Stat label={q.totalMass} value={mass(totals.total_mass_grams)} />
        <Stat label={p.longestLead} value={lead(totals.longest_lead_days)} />
        <Stat label={p.lineItems} value={String(totals.line_count)} />
        <Stat label={p.suppliersCount} value={String(totals.supplier_count)} />
        {totals.cost_per_kg_cents !== null ? (
          <Stat label={p.deliveredPerKg} value={`${money(totals.cost_per_kg_cents)}/kg`} />
        ) : null}
      </dl>

      {totals.embodied_energy_mj != null || totals.carbon_kg != null ? (
        <>
          <dl className="grid grid-cols-2 divide-rule-line rounded-lg border border-rule-line sm:grid-cols-3 print:rounded-none">
            {totals.embodied_energy_mj != null ? (
              <Stat label={q.embodiedEnergy} value={`${impactQuantity(totals.embodied_energy_mj, 1)} MJ`} />
            ) : null}
            {totals.carbon_kg != null ? (
              <Stat label={q.carbon} value={`${impactQuantity(totals.carbon_kg, 2)} kg CO₂e`} />
            ) : null}
            {totals.water_l != null ? (
              <Stat label={q.water} value={`${impactQuantity(totals.water_l, 0)} L`} />
            ) : null}
            {totals.freight_carbon_kg != null ? (
              <Stat label={q.freightCarbon} value={`${impactQuantity(totals.freight_carbon_kg, 2)} kg CO₂e`} />
            ) : null}
            {totals.carbon_intensity_kg_per_kg != null ? (
              <Stat
                label={q.carbonIntensity}
                value={`${impactQuantity(totals.carbon_intensity_kg_per_kg, 2)} kg CO₂e/kg`}
              />
            ) : null}
          </dl>
          <p className="text-xs text-pretty text-ink-muted">
            {totals.carbon_kg != null ? q.footprintNote : q.energyNote}
          </p>
        </>
      ) : null}

      {quotation.notices.length > 0 ? (
        <ul className="flex flex-col gap-0.5 text-xs text-ink-muted" aria-label={q.notices}>
          {quotation.notices.map((notice) => (
            <li key={notice}>{notice}</li>
          ))}
        </ul>
      ) : null}

      <footer className="flex flex-col gap-2 border-t border-rule-line pt-4 text-xs leading-relaxed text-ink-muted">
        <p className="font-mono">{basis}</p>
        <p>
          <strong className="font-medium text-ink">{p.termsHeading}</strong> {TERMS.terms}
        </p>
        <p>
          <strong className="font-medium text-ink">{p.academicHeading}</strong> {TERMS.academic}
        </p>
      </footer>
    </Card>
  );
}

function SheetRow({
  label,
  value,
  strong = false,
  last = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
  last?: boolean;
}) {
  const rule = last ? "" : "border-b border-rule-line";
  return (
    <tr className={strong ? "font-medium text-ink" : "text-ink-muted"}>
      <td colSpan={5} className={`${rule} px-3.5 py-2.5 text-end`}>
        {label}
      </td>
      <td className={`${rule} px-3.5 py-2.5 text-end font-mono tabular-nums ${strong ? "text-base" : ""}`}>
        {value}
      </td>
    </tr>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3">
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="font-mono text-base tabular-nums text-ink">{value}</dd>
    </div>
  );
}

function footprintRows(quotation: ProjectQuotation): string[][] {
  const q = strings.marketplace.quote;
  const totals = quotation.totals;
  const rows: string[][] = [];
  const add = (label: string, value: string) => rows.push([label, "", "", "", "", value]);
  if (totals.embodied_energy_mj != null) add(q.embodiedEnergy, `${impactQuantity(totals.embodied_energy_mj, 1)} MJ`);
  if (totals.carbon_kg != null) add(q.carbon, `${impactQuantity(totals.carbon_kg, 2)} kg CO₂e`);
  if (totals.water_l != null) add(q.water, `${impactQuantity(totals.water_l, 0)} L`);
  if (totals.freight_carbon_kg != null) {
    add(q.freightCarbon, `${impactQuantity(totals.freight_carbon_kg, 2)} kg CO₂e`);
  }
  if (totals.carbon_intensity_kg_per_kg != null) {
    add(q.carbonIntensity, `${impactQuantity(totals.carbon_intensity_kg_per_kg, 2)} kg CO₂e/kg`);
  }
  return rows;
}

/** The quotation as tab-separated text, which pastes into a spreadsheet or a
 * word-processor table as columns. Figures are the server's, in dollars. */
export function asTable(quotation: ProjectQuotation, currency: string): string {
  const p = strings.project;
  const dollars = (cents: number) => (cents / 100).toFixed(2);
  const rows = [
    [p.colItem, p.colDescription, p.colQuantity, p.colUnit, `${p.unitPrice} (${currency})`, `${p.colExtended} (${currency})`],
    ...quotation.lines.map((line) => [
      line.sku,
      `${line.name}, ${line.spec}`,
      String(line.quantity),
      line.unit_label,
      dollars(line.unit_price_cents),
      dollars(line.extended_cents + line.cut_fee_cents),
    ]),
    [],
    [p.subtotal, "", "", "", "", dollars(quotation.totals.goods_cents)],
    [p.freight, "", "", "", "", dollars(quotation.totals.freight_cents)],
    ...quotation.totals.taxes.map((tax) => [p.tax(tax.code, tax.rate * 100), "", "", "", "", dollars(tax.amount_cents)]),
    [p.grandTotal(currency), "", "", "", "", dollars(quotation.totals.total_cents)],
    ...footprintRows(quotation),
    [],
    [
      p.citation(
        quotation.reference ?? "",
        DAY.format(new Date(quotation.prepared_at * 1000)),
        DAY.format(new Date(quotation.valid_until * 1000)),
      ),
    ],
  ];
  return rows.map((row) => row.join("\t")).join("\n");
}
