import Link from "next/link";
import { notFound } from "next/navigation";

import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { SectionHeading } from "@/components/ui/section-heading";
import { getProjectMarketplace, listProjectLines } from "@/lib/api/marketplace";
import { requireSeat } from "@/lib/seat-session";
import { strings } from "../../../strings";
import { AddAll, CompareSet } from "../../_kit/controls";
import { LineGrid } from "../../_kit/line-card";
import { TRAY_LIMIT } from "../../_kit/limits";

// One brief (decision 0101, restyled in 0105): what the part has to do, the
// families in contention, and its candidates split into materials and the
// processing a cost model must also carry. The copy is plain that these are
// candidates and not answers: the report is marked on the weighting, not on
// the pick.
export default async function BriefPage({ params }: { params: Promise<{ briefId: string }> }) {
  const { token } = await requireSeat();
  const s = strings.marketplace;
  const p = strings.project;
  const { briefId } = await params;

  const front = await getProjectMarketplace(token);
  if (!front.ok) throw new Error(s.offline);
  const index = front.data.briefs.findIndex((brief) => brief.id === briefId);
  if (index < 0) notFound();
  const brief = front.data.briefs[index]!;

  const lines = await listProjectLines(token, { sku: brief.shortlist, limit: 96 });
  if (!lines.ok) throw new Error(s.offline);
  const materials = lines.data.items.filter((line) => !line.service);
  const services = lines.data.items.filter((line) => line.service);
  const toCompare = materials.slice(0, TRAY_LIMIT).map((line) => line.sku);
  const crumb =
    "rounded-sm transition-colors duration-(--motion-duration) ease-(--motion-ease) hover:text-ink focus-ring";

  return (
    <>
      <nav aria-label={p.breadcrumb} className="flex flex-wrap items-center gap-1.5 text-sm text-ink-muted">
        <Link href="/marketplace" className={crumb}>
          {p.home}
        </Link>
        <Icon name="chevron-right" size={14} />
        <Link href="/marketplace/briefs" className={crumb}>
          {p.briefs}
        </Link>
        <Icon name="chevron-right" size={14} />
        <span className="text-ink">{p.briefNumber(index + 1)}</span>
      </nav>

      <header className="flex flex-col gap-5">
        <div className="flex flex-col gap-3">
          <h1 className="font-display text-4xl leading-[1.05]">{brief.title}</h1>
          <p className="max-w-[var(--measure-reading)] text-pretty">
            <span className="font-medium">{p.keyFunctions}</span> {brief.selection_factors.join(" · ")}
          </p>
          <p className="max-w-[var(--measure-reading)] text-pretty">
            <span className="font-medium">{p.challenge}</span> {brief.candidate_families}
          </p>
        </div>
        <Card tone="sunken" className="flex max-w-[var(--measure-reading)] gap-3 text-sm">
          <Icon name="help" size={16} className="mt-0.5 shrink-0 text-ink-muted" />
          <p>
            <strong className="font-medium">{p.notAnswersHeading}</strong> {p.notAnswersBody}
          </p>
        </Card>
        <div className="flex flex-wrap items-center gap-3">
          {toCompare.length > 1 ? (
            <CompareSet skus={toCompare} label={p.loadIntoComparison(toCompare.length)} />
          ) : null}
          <AddAll
            lines={lines.data.items.map((line) => ({ sku: line.sku, moq: line.moq, name: line.name }))}
            label={p.addEveryCandidate}
          />
        </div>
      </header>

      <section aria-labelledby="materials" className="flex flex-col gap-5">
        <SectionHeading id="materials" title={p.candidateMaterials} />
        <LineGrid lines={materials} />
      </section>

      {services.length > 0 ? (
        <section aria-labelledby="processing" className="flex flex-col gap-5">
          <SectionHeading id="processing" title={p.processing} description={p.processingLede} />
          <LineGrid lines={services} />
        </section>
      ) : null}
    </>
  );
}
