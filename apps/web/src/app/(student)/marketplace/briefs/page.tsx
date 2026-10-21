import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { allProjectLines, getProjectMarketplace } from "@/lib/api/marketplace";
import { requireSeat } from "@/lib/seat-session";
import { strings } from "../../strings";

// Every project brief the catalogue maps (decision 0101, restyled in 0105),
// each with the lines a credible shortlist would draw on. The supplier count
// is read from the lines themselves, never guessed from a SKU's prefix.
export default async function BriefsPage() {
  const { token } = await requireSeat();
  const s = strings.marketplace;
  const p = strings.project;
  const [front, lines] = await Promise.all([getProjectMarketplace(token), allProjectLines(token)]);
  if (!front.ok || !lines.ok) throw new Error(s.offline);
  const supplierOf = new Map(lines.data.items.map((line) => [line.sku, line.supplier_id]));

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
        <span className="text-ink">{p.briefs}</span>
      </nav>
      <PageHeader title={p.briefs} description={p.briefsLede} />
      <ul className="grid gap-4 md:grid-cols-2">
        {front.data.briefs.map((brief, index) => {
          const stocked = brief.shortlist.filter((sku) => supplierOf.has(sku));
          const suppliers = new Set(stocked.map((sku) => supplierOf.get(sku))).size;
          return (
            <Card
              key={brief.id}
              as="li"
              className="flex flex-col gap-3 transition-[border-color,box-shadow] duration-(--motion-duration) ease-(--motion-ease) hover:border-ink hover:shadow-floating"
            >
              <div>
                <Badge mono>{p.briefNumber(index + 1)}</Badge>
              </div>
              <Link
                href={`/marketplace/briefs/${brief.id}`}
                className="font-display text-xl leading-snug text-ink hover:text-accent-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent rounded-sm"
              >
                {brief.title}
              </Link>
              <p className="text-sm text-ink-muted">
                <span className="font-medium text-ink">{p.keyFunctions}</span>{" "}
                {brief.selection_factors.join(" · ")}
              </p>
              <p className="text-sm">
                <span className="font-medium">{p.challenge}</span> {brief.candidate_families}
              </p>
              <p className="mt-auto border-t border-rule-line pt-3 font-mono text-xs tabular-nums text-ink-muted">
                {p.candidates(stocked.length, suppliers)}
              </p>
            </Card>
          );
        })}
      </ul>
    </>
  );
}
