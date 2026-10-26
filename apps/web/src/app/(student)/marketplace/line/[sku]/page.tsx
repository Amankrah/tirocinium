import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { SectionHeading } from "@/components/ui/section-heading";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { getProjectLine } from "@/lib/api/marketplace";
import { lead, money } from "@/lib/money";
import { requireSeat } from "@/lib/seat-session";
import { EnvironmentalPanel, hasEnvironmentalLayer } from "../../../_marketplace/environmental-panel";
import { MaterialSwatch } from "../../../_marketplace/material-swatch";
import { strings } from "../../../strings";
import { LineActions } from "../../_kit/controls";
import { LineGrid } from "../../_kit/line-card";
import { dataSheet } from "../../_kit/properties";

// One line in full (decision 0101, restyled in 0105): what it costs and on
// what terms, the price ladder, what it is, how it is made into a part, its
// data sheet and the derived indices a selection is argued on. The indices
// come from the server, from the same functions the comparison uses, so the
// two can never disagree. The buy box is the one raised sheet on the page,
// because it is the thing the student acts in.
export default async function LinePage({ params }: { params: Promise<{ sku: string }> }) {
  const { token } = await requireSeat();
  const s = strings.marketplace;
  const p = strings.project;
  const { sku } = await params;

  const result = await getProjectLine(token, decodeURIComponent(sku));
  if (!result.ok) {
    if (result.status === 404) notFound();
    throw new Error(s.offline);
  }
  const line = result.data;
  const sheet = dataSheet(line.properties, line.service);
  const { indices } = line;
  const perLitre =
    line.unit === "kg" && indices.cost_per_litre_cents !== null ? indices.cost_per_litre_cents : null;
  const crumb =
    "rounded-sm transition-colors duration-(--motion-duration) ease-(--motion-ease) hover:text-ink focus-ring";

  return (
    <>
      <nav aria-label={p.breadcrumb} className="flex flex-wrap items-center gap-1.5 text-sm text-ink-muted">
        <Link href="/marketplace" className={crumb}>
          {p.home}
        </Link>
        <Icon name="chevron-right" size={14} />
        <Link href={`/marketplace/store/${line.supplier_id}`} className={crumb}>
          {line.supplier_name}
        </Link>
        <Icon name="chevron-right" size={14} />
        <span>{line.category}</span>
        <Icon name="chevron-right" size={14} />
        <span className="font-mono text-ink">{line.sku}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <Card
          as="aside"
          aria-label={p.buy}
          className="flex flex-col gap-4 self-start lg:sticky lg:top-[calc(var(--app-header-height)+1rem)]"
        >
          <div className="flex flex-col gap-1">
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-mono text-3xl tabular-nums leading-none">{money(line.price_cents)}</span>
              <span className="text-sm text-ink-muted"> / {line.unit_label}</span>
            </p>
            {line.price_per_kg_cents !== null && line.unit !== "kg" ? (
              <p className="font-mono text-xs tabular-nums text-ink-muted">
                {p.perKgDetail(money(Math.round(line.price_per_kg_cents)), String(line.kg_per_unit), line.unit_label)}
              </p>
            ) : null}
            {perLitre !== null ? (
              <p className="font-mono text-xs tabular-nums text-ink-muted">{p.perLitre(money(Math.round(perLitre)))}</p>
            ) : null}
            {line.market_check ? (
              <p className="text-sm text-ink-muted">
                {line.market_check.stale
                  ? p.shopReadingStale(
                      line.market_check.store,
                      line.market_check.place,
                      line.market_check.observed_on,
                      money(line.market_check.cents),
                    )
                  : p.shopReading(
                      line.market_check.store,
                      line.market_check.place,
                      line.market_check.observed_on,
                      money(line.market_check.cents),
                    )}{" "}
                {line.market_check.what}{" "}
                {line.market_check.stale ? `${p.shopKept} ` : null}
                {p.shopQuotation}{" "}
                <a
                  href={line.market_check.page}
                  target="_blank"
                  rel="noreferrer"
                  className="underline decoration-rule underline-offset-2 hover:text-ink focus-ring"
                >
                  {p.shopPage}
                </a>
              </p>
            ) : null}
          </div>
          <ul className="flex flex-col gap-1.5 border-t border-rule-line pt-4 text-sm">
            <li className="flex items-start gap-2">
              <Icon name="clock" size={14} className="mt-1 shrink-0 text-ink-muted" />
              <span>
                {line.stock_label} · {p.ships(lead(line.lead_days))}
              </span>
            </li>
            <li className="flex items-start gap-2 text-ink-muted">
              <Icon name="tag" size={14} className="mt-1 shrink-0" />
              <span>
                {s.minimumOrder(String(line.moq), line.unit_label)}
                {line.cut_fee_cents > 0 ? ` · ${p.cutFee(money(line.cut_fee_cents))}` : ""}
              </span>
            </li>
          </ul>
          {line.price_breaks.length > 0 ? (
            <Table>
              <caption className="px-3.5 py-2 text-start text-xs font-medium text-ink-muted">{p.breaks}</caption>
              <thead>
                <tr>
                  <Th>{p.orderAtLeast}</Th>
                  <Th justify="end">{p.unitPrice}</Th>
                </tr>
              </thead>
              <tbody>
                {line.price_breaks.map(([quantity, percent]) => (
                  <Tr key={quantity}>
                    <Td numeric className="py-2">
                      {quantity} {line.unit_label}
                    </Td>
                    <Td numeric justify="end" className="py-2">
                      {money(Math.round(line.price_cents * (1 - percent / 100)))}{" "}
                      <span className="text-ink-muted">−{percent} %</span>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          ) : null}
          <LineActions line={{ sku: line.sku, moq: line.moq, name: line.name }} size="full" />
          <ButtonLink
            href={`/marketplace/request?sku=${encodeURIComponent(line.sku)}`}
            variant="quiet"
            className="w-full text-ink-muted"
          >
            <Icon name="inbox" size={14} />
            {p.askAboutLine}
          </ButtonLink>
        </Card>

        <article className="flex flex-col gap-6">
          <MaterialSwatch swatch={line.swatch} category={line.category} label={line.category} size="hero" />
          <header className="flex flex-col gap-2">
            <p className="text-sm text-ink-muted">{line.supplier_name}</p>
            <h1 className="font-display text-4xl leading-[1.05]">{line.name}</h1>
            <p className="font-mono text-xs tabular-nums text-ink-muted">
              {line.sku} · {line.spec}
            </p>
          </header>
          {line.tags.length > 0 ? (
            <ul className="flex flex-wrap gap-1" aria-label={p.attributes}>
              {line.tags.map((tag) => (
                <li key={tag}>
                  <Badge>{tag}</Badge>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="max-w-[var(--measure-reading)] text-pretty leading-relaxed">{line.description}</p>
          {line.fabrication ? (
            <Card tone="sunken" className="max-w-[var(--measure-reading)] text-sm">
              <p>
                <strong className="font-medium">{p.fabrication}</strong> {line.fabrication}
              </p>
            </Card>
          ) : null}

          {sheet.length > 0 ? (
            <section aria-labelledby="sheet" className="flex flex-col gap-4">
              <SectionHeading id="sheet" title={p.dataSheet} />
              <dl className="grid gap-x-8 sm:grid-cols-2">
                {sheet.map((row) => (
                  <div
                    key={row.label}
                    className="flex justify-between gap-4 border-b border-rule-line py-2 text-sm"
                  >
                    <dt className="text-ink-muted">{row.label}</dt>
                    <dd className="text-end font-mono tabular-nums">{row.value}</dd>
                  </div>
                ))}
              </dl>
              {indices.specific_strength !== null || indices.specific_stiffness !== null ? (
                <Card tone="accent" className="flex max-w-[var(--measure-reading)] flex-col gap-2 text-sm">
                  <p className="font-medium">{p.indices}</p>
                  <ul className="flex flex-col gap-0.5 font-mono text-xs tabular-nums">
                    {indices.specific_strength !== null ? (
                      <li>{p.specificStrength(indices.specific_strength.toFixed(1))}</li>
                    ) : null}
                    {indices.specific_stiffness !== null ? (
                      <li>{p.specificStiffness(indices.specific_stiffness.toFixed(1))}</li>
                    ) : null}
                    {indices.strength_per_dollar !== null ? (
                      <li>{p.strengthPerDollar(indices.strength_per_dollar.toFixed(2))}</li>
                    ) : null}
                    {indices.carbon_for_strength != null ? (
                      <li>{p.carbonForStrength(indices.carbon_for_strength.toFixed(2))}</li>
                    ) : null}
                    {indices.carbon_for_stiffness != null ? (
                      <li>{p.carbonForStiffness(indices.carbon_for_stiffness.toFixed(1))}</li>
                    ) : null}
                    {indices.carbon_per_dollar != null ? (
                      <li>{p.carbonPerDollar(indices.carbon_per_dollar.toFixed(2))}</li>
                    ) : null}
                  </ul>
                  <p className="text-xs text-ink-muted">{p.indicesNote}</p>
                  {indices.carbon_for_strength != null || indices.carbon_per_dollar != null ? (
                    <p className="text-xs text-ink-muted">{p.carbonIndicesNote}</p>
                  ) : null}
                </Card>
              ) : null}
            </section>
          ) : (
            <Card tone="sunken" className="max-w-[var(--measure-reading)] text-sm">
              <p>
                <strong className="font-medium">{p.processHeading}</strong> {p.processBody}
              </p>
            </Card>
          )}

          {hasEnvironmentalLayer(line) ? <EnvironmentalPanel line={line} /> : null}
        </article>
      </div>

      {line.related.length > 0 ? (
        <section aria-labelledby="related" className="flex flex-col gap-5">
          <SectionHeading id="related" title={p.related} />
          <LineGrid lines={line.related} />
        </section>
      ) : null}
    </>
  );
}
