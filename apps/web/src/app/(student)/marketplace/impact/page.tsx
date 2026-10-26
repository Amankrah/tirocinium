import Link from "next/link";

import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeading } from "@/components/ui/section-heading";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { getProjectMarketplace, listProjectLines } from "@/lib/api/marketplace";
import { money } from "@/lib/money";
import { requireSeat } from "@/lib/seat-session";
import { impactQuantity } from "../../_marketplace/impact-format";
import { strings } from "../../strings";
import { CONTENT_CATALOGUE, IMPACT, IMPACT_SKUS } from "../_kit/content";

// How to weigh cost, performance and impact together (decision 0110). The
// prose is the method. The numbers are read from the catalogue this seat is
// on, so a course pinned to an earlier version is not shown a figure it
// cannot open.
export default async function ImpactPage() {
  const { token } = await requireSeat();
  const s = strings.marketplace;
  const p = strings.project;
  const front = await getProjectMarketplace(token);
  if (!front.ok) throw new Error(s.offline);
  const listed = await listProjectLines(token, { sku: IMPACT_SKUS, limit: IMPACT_SKUS.length });
  if (!listed.ok) throw new Error(s.offline);

  const ours = front.data.catalogue_id === CONTENT_CATALOGUE;
  const items = listed.data.items;
  const hasLayer = items.some((line) => line.carbon_kg_co2e != null);
  const rowHeader = "border-b border-rule-line px-3.5 py-3 text-start align-top font-medium";

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
        <span className="text-ink">{p.impact}</span>
      </nav>
      <PageHeader title={IMPACT.title} description={IMPACT.lede} />

      <section aria-labelledby="indicators" className="flex max-w-[var(--measure-reading)] flex-col gap-4">
        <SectionHeading id="indicators" title={IMPACT.indicatorsHeading} rule={false} />
        <dl className="flex flex-col gap-3">
          {IMPACT.indicators.map(([name, body]) => (
            <div key={name}>
              <dt className="font-medium">{name}</dt>
              <dd className="text-sm text-pretty text-ink-muted">{body}</dd>
            </div>
          ))}
        </dl>
        <p className="text-sm text-pretty text-ink-muted">{IMPACT.bands}</p>
        <p className="text-sm text-pretty text-ink-muted">{IMPACT.quote}</p>
        <p className="text-sm text-pretty text-ink-muted">{IMPACT.freight}</p>
        <p className="text-sm text-pretty text-ink-muted">{IMPACT.indices}</p>
      </section>

      {hasLayer ? (
        <Card as="section" aria-labelledby="worked" className="flex flex-col gap-4">
          <SectionHeading id="worked" title={IMPACT.tableHeading} rule={false} />
          <p className="max-w-[var(--measure-reading)] text-sm text-pretty text-ink-muted">{IMPACT.tableLede}</p>
          <Table>
            <thead>
              <tr>
                {IMPACT.columns.map((column) => (
                  <Th key={column}>{column}</Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((line) => (
                <Tr key={line.sku}>
                  <th scope="row" className={rowHeader}>
                    <Link
                      href={`/marketplace/line/${encodeURIComponent(line.sku)}`}
                      className="rounded-sm hover:text-accent-text focus-ring"
                    >
                      {line.name}
                    </Link>
                    <span className="block font-mono text-xs font-normal text-ink-muted">{line.sku}</span>
                  </th>
                  <Td numeric>
                    {money(line.price_cents)}
                    <span className="block text-xs font-normal text-ink-muted">/ {line.unit_label}</span>
                  </Td>
                  <Td numeric>{figure(line.carbon_kg_co2e, 2, "kg CO₂e/kg")}</Td>
                  <Td numeric>{figure(line.embodied_energy_mj_kg, 1, "MJ/kg")}</Td>
                  <Td numeric>{figure(line.water_l_kg, 0, "L/kg")}</Td>
                  <Td numeric>{figure(line.end_of_life_recovery_percent, 0, "%")}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      ) : (
        <Card tone="sunken" className="max-w-[var(--measure-reading)] text-sm">
          <p>{IMPACT.absent}</p>
        </Card>
      )}

      {ours ? (
        <section aria-labelledby="mistakes" className="flex max-w-[var(--measure-reading)] flex-col gap-4">
          <SectionHeading id="mistakes" title={IMPACT.mistakesHeading} rule={false} />
          <ol className="flex flex-col gap-3">
            {IMPACT.mistakes.map(([title, body]) => (
              <li key={title}>
                <p className="font-medium">{title}</p>
                <p className="text-sm text-pretty text-ink-muted">{body}</p>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </>
  );
}

function figure(value: number | null | undefined, digits: number, unit: string): string {
  if (value == null) return "n/a";
  return `${impactQuantity(value, digits)} ${unit}`;
}
