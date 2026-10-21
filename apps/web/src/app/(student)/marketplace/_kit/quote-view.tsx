"use client";

// The quote (decisions 0100 and 0101): edit the basket, then read it as the
// quotation that will print. Every figure is the server's pricing of the
// basket at list prices; nothing is kept, so printing (or saving as PDF) and
// copying as a table are how a student takes it into their report.
//
// On paper only the quotation sheet appears: the editor, the buttons and the
// whole marketplace frame are hidden from the printer.
import Link from "next/link";
import { useState } from "react";

import { Button, buttonClassName } from "@/components/ui/button";
import type { ProjectQuotation } from "@/lib/api/marketplace";
import { lead, mass, money } from "@/lib/money";
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
      <section className="flex flex-col gap-3">
        <h1 className="font-display text-3xl">{p.quotation}</h1>
        <p className="text-ink-muted">{p.emptyQuote}</p>
        <div className="flex flex-wrap gap-3">
          <Link href="/marketplace/briefs" className={buttonClassName("primary")}>
            {p.startFromBrief}
          </Link>
          <Link href="/marketplace/search" className={buttonClassName("quiet")}>
            {p.browseEverything}
          </Link>
        </div>
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
      <section aria-labelledby="editor" aria-busy={market.pending} className="flex flex-col gap-4 print:hidden">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 id="editor" className="font-display text-3xl">
            {p.quotation}
          </h1>
          <p className="text-sm text-ink-muted">{p.notSaved}</p>
        </div>
        {market.failure ? (
          <p role="alert" className="text-sm text-flag-amber">
            {market.failure}
          </p>
        ) : null}
        {quotation ? (
          <div className="max-w-2xl rounded-lg border border-rule-line p-4">
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
          </div>
        ) : (
          <p className="text-sm text-ink-muted">{p.pricing}</p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => window.print()} disabled={!quotation || market.pending}>
            {p.print}
          </Button>
          <Button
            variant="quiet"
            onClick={() => quotation && copy(quotation)}
            disabled={!quotation || market.pending}
          >
            {p.copyTable}
          </Button>
          <Button variant="quiet" onClick={market.clear} disabled={market.pending}>
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
  const cell = "border-b border-rule-line/60 px-2 py-1.5 align-top";
  const num = `${cell} text-right font-mono tabular-nums`;

  return (
    <article
      aria-labelledby="sheet-reference"
      className="flex flex-col gap-4 rounded-lg border border-rule-line bg-paper p-6 text-sm print:border-0 print:p-0"
    >
      <header className="flex flex-wrap justify-between gap-4 border-b border-rule-line pb-4">
        <div className="flex flex-col gap-1">
          <p className="font-display text-lg">{title}</p>
          <p className="text-xs text-ink-muted">{p.consolidated}</p>
          <ul className="text-xs text-ink-muted">
            {involved.map((supplier) => (
              <li key={supplier.id}>
                {supplier.name}, {supplier.city}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col gap-0.5 text-right text-xs">
          <h2 id="sheet-reference" className="font-mono text-base">
            {quotation.reference ? p.reference(quotation.reference) : p.quotation}
          </h2>
          <span>{p.prepared(DAY.format(new Date(quotation.prepared_at * 1000)))}</span>
          <span>{p.validUntil(DAY.format(new Date(quotation.valid_until * 1000)))}</span>
          <span>{p.currencyShort(currency)}</span>
          <span>{p.terms}</span>
        </div>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-rule-line text-left text-ink-muted">
              <th scope="col" className="px-2 py-1.5 font-medium">{p.colItem}</th>
              <th scope="col" className="px-2 py-1.5 font-medium">{p.colDescription}</th>
              <th scope="col" className="px-2 py-1.5 text-right font-medium">{p.colQuantity}</th>
              <th scope="col" className="px-2 py-1.5 text-right font-medium">{p.unitPrice}</th>
              <th scope="col" className="px-2 py-1.5 text-right font-medium">{p.colDiscount}</th>
              <th scope="col" className="px-2 py-1.5 text-right font-medium">{p.colExtended}</th>
            </tr>
          </thead>
          <tbody>
            {quotation.lines.map((line) => (
              <tr key={line.sku}>
                <td className={`${cell} font-mono`}>{line.sku}</td>
                <td className={cell}>
                  <span className="font-medium">{line.name}</span>
                  <span className="block text-ink-muted">
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
          <tfoot>
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
            <SheetRow label={p.grandTotal(currency)} value={money(totals.total_cents)} strong />
          </tfoot>
        </table>
      </div>

      <dl className="flex flex-wrap gap-x-8 gap-y-2 text-xs">
        <Stat label={q.totalMass} value={mass(totals.total_mass_grams)} />
        <Stat label={p.longestLead} value={lead(totals.longest_lead_days)} />
        <Stat label={p.lineItems} value={String(totals.line_count)} />
        <Stat label={p.suppliersCount} value={String(totals.supplier_count)} />
        {totals.cost_per_kg_cents !== null ? (
          <Stat label={p.deliveredPerKg} value={`${money(totals.cost_per_kg_cents)}/kg`} />
        ) : null}
      </dl>

      {quotation.notices.length > 0 ? (
        <ul className="flex flex-col gap-0.5 text-xs text-ink-muted" aria-label={q.notices}>
          {quotation.notices.map((notice) => (
            <li key={notice}>{notice}</li>
          ))}
        </ul>
      ) : null}

      <footer className="flex flex-col gap-2 border-t border-rule-line pt-3 text-xs text-ink-muted">
        <p>{basis}</p>
        <p>
          <strong className="font-medium text-ink">{p.termsHeading}</strong> {TERMS.terms}
        </p>
        <p>
          <strong className="font-medium text-ink">{p.academicHeading}</strong> {TERMS.academic}
        </p>
      </footer>
    </article>
  );
}

function SheetRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <tr className={strong ? "font-medium" : ""}>
      <td colSpan={5} className="border-b border-rule-line/60 px-2 py-1.5 text-right">
        {label}
      </td>
      <td className="border-b border-rule-line/60 px-2 py-1.5 text-right font-mono tabular-nums">{value}</td>
    </tr>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="font-mono tabular-nums">{value}</dd>
    </div>
  );
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
