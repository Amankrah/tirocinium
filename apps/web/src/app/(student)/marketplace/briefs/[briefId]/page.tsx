import Link from "next/link";
import { notFound } from "next/navigation";

import { getProjectMarketplace, listProjectLines } from "@/lib/api/marketplace";
import { requireSeat } from "@/lib/seat-session";
import { strings } from "../../../strings";
import { AddAll, CompareSet } from "../../_kit/controls";
import { LineGrid } from "../../_kit/line-card";
import { TRAY_LIMIT } from "../../_kit/limits";

// One brief (decision 0101): what the part has to do, the families in
// contention, and its candidates split into materials and the processing a
// cost model must also carry. The copy is plain that these are candidates and
// not answers: the report is marked on the weighting, not on the pick.
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

  return (
    <>
      <nav aria-label={p.breadcrumb} className="text-sm text-ink-muted">
        <Link href="/marketplace" className="underline hover:text-ink">
          {p.home}
        </Link>{" "}
        ›{" "}
        <Link href="/marketplace/briefs" className="underline hover:text-ink">
          {p.briefs}
        </Link>{" "}
        › {p.briefNumber(index + 1)}
      </nav>

      <header className="flex flex-col gap-3">
        <h1 className="font-display text-4xl">{brief.title}</h1>
        <p className="max-w-[var(--measure-reading)]">
          <span className="font-medium">{p.keyFunctions}</span> {brief.selection_factors.join(" · ")}
        </p>
        <p className="max-w-[var(--measure-reading)]">
          <span className="font-medium">{p.challenge}</span> {brief.candidate_families}
        </p>
        <p className="max-w-[var(--measure-reading)] rounded-lg border border-rule-line p-4 text-sm">
          <strong className="font-medium">{p.notAnswersHeading}</strong> {p.notAnswersBody}
        </p>
        <div className="flex flex-wrap gap-3">
          {toCompare.length > 1 ? (
            <CompareSet skus={toCompare} label={p.loadIntoComparison(toCompare.length)} />
          ) : null}
          <AddAll
            lines={lines.data.items.map((line) => ({ sku: line.sku, moq: line.moq, name: line.name }))}
            label={p.addEveryCandidate}
          />
        </div>
      </header>

      <section aria-labelledby="materials" className="flex flex-col gap-4">
        <h2 id="materials" className="font-display text-2xl">
          {p.candidateMaterials}
        </h2>
        <LineGrid lines={materials} />
      </section>

      {services.length > 0 ? (
        <section aria-labelledby="processing" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 id="processing" className="font-display text-2xl">
              {p.processing}
            </h2>
            <p className="max-w-[var(--measure-reading)] text-sm text-ink-muted">{p.processingLede}</p>
          </div>
          <LineGrid lines={services} />
        </section>
      ) : null}
    </>
  );
}
