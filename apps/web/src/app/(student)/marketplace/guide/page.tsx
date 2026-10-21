import Link from "next/link";

import { buttonClassName } from "@/components/ui/button";
import { getProjectMarketplace } from "@/lib/api/marketplace";
import { money } from "@/lib/money";
import { requireSeat } from "@/lib/seat-session";
import { strings } from "../../strings";
import { CONTENT_CATALOGUE, GUIDE } from "../_kit/content";

// How to build a quote a marker will believe (decision 0101). The worked
// figures are pinned to the catalogue by the content test; the invoice rules
// (freight, taxes, validity) are read from the catalogue itself, so this page
// states what the quotation will actually do.
export default async function GuidePage() {
  const { token } = await requireSeat();
  const s = strings.marketplace;
  const p = strings.project;
  const front = await getProjectMarketplace(token);
  if (!front.ok) throw new Error(s.offline);
  const market = front.data;
  const freight = market.freight;
  const taxes = market.taxes.map((tax) => p.tax(tax.code, tax.rate * 100)).join(" + ");
  const totalRate = market.taxes.reduce((sum, tax) => sum + tax.rate, 0) * 100;
  const card = "flex flex-col gap-3 rounded-lg border border-rule-line p-5";
  const th = "border-b border-rule-line py-2 pr-4 text-left text-xs font-medium text-ink-muted";
  const td = "border-b border-rule-line/60 py-2 pr-4 align-top";

  const invoice: [string, string, string][] = [
    [p.invoiceMoq, p.invoiceMoqHow, p.invoiceMoqWhy],
    [p.invoiceBreaks, p.invoiceBreaksHow, p.invoiceBreaksWhy],
    [p.invoiceCutting, p.invoiceCuttingHow, p.invoiceCuttingWhy],
    [p.invoiceProcessing, p.invoiceProcessingHow, p.invoiceProcessingWhy],
    [
      p.invoiceFreight,
      p.invoiceFreightHow(
        money(freight.base_cents),
        money(freight.per_kg_cents),
        money(freight.long_item_cents),
      ),
      p.invoiceFreightWhy,
    ],
    [taxes, p.invoiceTaxHow(totalRate.toFixed(3).replace(/\.?0+$/, "")), p.invoiceTaxWhy],
  ];

  return (
    <>
      <nav aria-label={p.breadcrumb} className="text-sm text-ink-muted">
        <Link href="/marketplace" className="underline hover:text-ink">
          {p.home}
        </Link>{" "}
        › {p.guide}
      </nav>
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-4xl">{GUIDE.title}</h1>
        <p className="max-w-[var(--measure-reading)] text-ink-muted">{GUIDE.lede}</p>
      </header>

      {market.catalogue_id === CONTENT_CATALOGUE ? (
        <section className={card} aria-labelledby="function">
          <h2 id="function" className="font-display text-xl">
            {GUIDE.functionHeading}
          </h2>
          <p className="max-w-[var(--measure-reading)]">{GUIDE.functionBody}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  {GUIDE.functionColumns.map((column) => (
                    <th key={column} scope="col" className={th}>
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {GUIDE.functionRows.map(([limit, index, example]) => (
                  <tr key={limit}>
                    <th scope="row" className={`${td} font-normal`}>
                      {limit}
                    </th>
                    <td className={`${td} font-mono`}>{index}</td>
                    <td className={td}>{example}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className={card} aria-labelledby="invoice">
        <h2 id="invoice" className="font-display text-xl">
          {GUIDE.invoiceHeading}
        </h2>
        <p className="max-w-[var(--measure-reading)]">{GUIDE.invoiceBody}</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                {GUIDE.invoiceColumns.map((column) => (
                  <th key={column} scope="col" className={th}>
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invoice.map(([line, how, why]) => (
                <tr key={line}>
                  <th scope="row" className={`${td} font-medium`}>
                    {line}
                  </th>
                  <td className={td}>{how}</td>
                  <td className={td}>{why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={card} aria-labelledby="dating">
        <h2 id="dating" className="font-display text-xl">
          {GUIDE.datingHeading}
        </h2>
        <p className="max-w-[var(--measure-reading)]">{GUIDE.datingBody}</p>
        <p className="max-w-[var(--measure-reading)] text-sm text-ink-muted">
          {p.validityNote(market.quote_validity_days)}
        </p>
        {market.catalogue_id === CONTENT_CATALOGUE ? (
          <div className="rounded-lg border border-rule-line p-4 text-sm">
            <p>{GUIDE.citeLead}</p>
            <p className="mt-2 font-mono text-xs">{GUIDE.citeExample("BREE-P-20261021-A67C48")}</p>
          </div>
        ) : null}
      </section>

      <section className={card} aria-labelledby="tradeoff">
        <h2 id="tradeoff" className="font-display text-xl">
          {GUIDE.tradeoffHeading}
        </h2>
        <p className="max-w-[var(--measure-reading)]">{GUIDE.tradeoffBody}</p>
        <div>
          <Link href="/marketplace/briefs" className={buttonClassName("primary")}>
            {p.toBriefs}
          </Link>
        </div>
      </section>
    </>
  );
}
