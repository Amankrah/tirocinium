import Link from "next/link";

import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeading } from "@/components/ui/section-heading";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { getProjectMarketplace } from "@/lib/api/marketplace";
import { requireSeat } from "@/lib/seat-session";
import { strings } from "../../strings";
import { CONTENT_CATALOGUE, SOURCES } from "../_kit/content";

// Where the prices come from (decision 0101, restyled in 0105): the published
// data each part of the catalogue is anchored to, so a student can cite the
// marketplace or go past it to the market data. It belongs to one catalogue
// and says nothing for any other rather than vouching for figures it did not
// source.
export default async function SourcesPage() {
  const { token } = await requireSeat();
  const s = strings.marketplace;
  const p = strings.project;
  const front = await getProjectMarketplace(token);
  if (!front.ok) throw new Error(s.offline);
  const ours = front.data.catalogue_id === CONTENT_CATALOGUE;
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
        <span className="text-ink">{p.sources}</span>
      </nav>
      <PageHeader title={SOURCES.title} description={ours ? SOURCES.lede : front.data.course_note} />
      {ours ? (
        <>
          <Card tone="sunken" className="flex max-w-[var(--measure-reading)] gap-3 text-sm">
            <Icon name="file" size={16} className="mt-0.5 shrink-0 text-ink-muted" />
            <p>{SOURCES.notice}</p>
          </Card>
          <Card as="section" className="flex flex-col gap-4">
            <Table>
              <thead>
                <tr>
                  {SOURCES.columns.map((column) => (
                    <Th key={column}>{column}</Th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SOURCES.rows.map(([area, anchor, source, site]) => (
                  <Tr key={area}>
                    <th scope="row" className={rowHeader}>
                      {area}
                    </th>
                    <Td>{anchor}</Td>
                    <Td>
                      {source}
                      <span className="block font-mono text-xs text-ink-muted">{site}</span>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </Card>
          <Card as="section" aria-labelledby="property-data" className="flex flex-col gap-3">
            <SectionHeading id="property-data" title={SOURCES.propertiesHeading} rule={false} />
            <p className="max-w-[var(--measure-reading)] text-pretty text-sm text-ink-muted">
              {SOURCES.properties}
            </p>
          </Card>
        </>
      ) : null}
    </>
  );
}
