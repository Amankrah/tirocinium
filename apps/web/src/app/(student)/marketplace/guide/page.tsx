import Link from "next/link";

import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeading } from "@/components/ui/section-heading";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { getProjectMarketplace } from "@/lib/api/marketplace";
import { money } from "@/lib/money";
import { requireSeat } from "@/lib/seat-session";
import { strings } from "../../strings";
import { CONTENT_CATALOGUE, GUIDE } from "../_kit/content";

// How to build a quote a marker will believe (decision 0101, restyled in
// 0105). The worked figures are pinned to the catalogue by the content test;
// the invoice rules (freight, taxes, validity) are read from the catalogue
// itself, so this page states what the quotation will actually do.
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
  // A row header sits in the same rhythm as a Td: the hairline, the padding,
  // the top alignment; only the weight differs.
  const rowHeader = "border-b border-rule-line px-3.5 py-3 text-start align-top";

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
      <nav aria-label={p.breadcrumb} className="flex flex-wrap items-center gap-1.5 text-sm text-ink-muted">
        <Link
          href="/marketplace"
          className="rounded-sm transition-colors duration-(--motion-duration) ease-(--motion-ease) hover:text-ink focus-ring"
        >
          {p.home}
        </Link>
        <Icon name="chevron-right" size={14} />
        <span className="text-ink">{p.guide}</span>
      </nav>
      <PageHeader title={GUIDE.title} description={GUIDE.lede} />

      {market.catalogue_id === CONTENT_CATALOGUE ? (
        <Card as="section" aria-labelledby="function" className="flex flex-col gap-4">
          <SectionHeading id="function" title={GUIDE.functionHeading} rule={false} />
          <p className="max-w-[var(--measure-reading)] text-pretty">{GUIDE.functionBody}</p>
          <Table>
            <thead>
              <tr>
                {GUIDE.functionColumns.map((column) => (
                  <Th key={column}>{column}</Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {GUIDE.functionRows.map(([limit, index, example]) => (
                <Tr key={limit}>
                  <th scope="row" className={`${rowHeader} font-normal`}>
                    {limit}
                  </th>
                  <Td numeric>{index}</Td>
                  <Td>{example}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      ) : null}

      <Card as="section" aria-labelledby="invoice" className="flex flex-col gap-4">
        <SectionHeading id="invoice" title={GUIDE.invoiceHeading} rule={false} />
        <p className="max-w-[var(--measure-reading)] text-pretty">{GUIDE.invoiceBody}</p>
        <Table>
          <thead>
            <tr>
              {GUIDE.invoiceColumns.map((column) => (
                <Th key={column}>{column}</Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {invoice.map(([line, how, why]) => (
              <Tr key={line}>
                <th scope="row" className={`${rowHeader} font-medium`}>
                  {line}
                </th>
                <Td>{how}</Td>
                <Td>{why}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <Card as="section" aria-labelledby="dating" className="flex flex-col gap-4">
        <SectionHeading id="dating" title={GUIDE.datingHeading} rule={false} />
        <p className="max-w-[var(--measure-reading)] text-pretty">{GUIDE.datingBody}</p>
        <p className="max-w-[var(--measure-reading)] text-sm text-ink-muted">
          {p.validityNote(market.quote_validity_days)}
        </p>
        {market.catalogue_id === CONTENT_CATALOGUE ? (
          <Card tone="sunken" className="flex max-w-[var(--measure-reading)] flex-col gap-2 text-sm">
            <p>{GUIDE.citeLead}</p>
            <p className="font-mono text-xs tabular-nums">{GUIDE.citeExample("BREE-P-20261021-A67C48")}</p>
          </Card>
        ) : null}
      </Card>

      <Card as="section" aria-labelledby="tradeoff" className="flex flex-col gap-4">
        <SectionHeading id="tradeoff" title={GUIDE.tradeoffHeading} rule={false} />
        <p className="max-w-[var(--measure-reading)] text-pretty">{GUIDE.tradeoffBody}</p>
        <div>
          <ButtonLink href="/marketplace/briefs">
            {p.toBriefs}
            <Icon name="arrow-right" size={16} />
          </ButtonLink>
        </div>
      </Card>
    </>
  );
}
