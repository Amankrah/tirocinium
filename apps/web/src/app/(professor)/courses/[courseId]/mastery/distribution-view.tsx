import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import type { Schemas } from "@/lib/api/client";
import { strings } from "../../../strings";

// The professor's per-concept distribution (mastery spec 6, guide 4.2b): the
// class's relationship to the material, not a leaderboard of people. Anonymous
// counts only. The bar is a single-hue intensity ramp on the token layer, calm
// and free of any good/bad judgment (guide 3.2 keeps green and amber for
// variant and recognition states, so a mastery band never borrows them); the
// counts are also given as text, with a swatch each, and the bar carries an
// accessible label. A Server Component. The gaps slot is designed but empty
// until Phase 7's defenses name misconceptions verbatim.
const s = strings.distribution;
const SEGMENTS = ["unseen", "shaky", "developing", "solid"] as const;
type Segment = (typeof SEGMENTS)[number];
const SEGMENT_CLASS: Record<Segment, string> = {
  unseen: "bg-field-border/35",
  shaky: "bg-accent/30",
  developing: "bg-accent/60",
  solid: "bg-accent",
};

export function DistributionView({
  distribution,
}: {
  distribution: Schemas["DistributionOut"];
}) {
  if (distribution.concepts.length === 0) {
    return <EmptyState icon="chart" body={s.empty} />;
  }

  return (
    <Card as="section" padded={false}>
      <ul className="flex flex-col divide-y divide-rule-line">
        {distribution.concepts.map((concept) => {
          const counts: Record<Segment, number> = {
            unseen: concept.unseen,
            shaky: concept.shaky,
            developing: concept.developing,
            solid: concept.solid,
          };
          const total = SEGMENTS.reduce((sum, key) => sum + counts[key], 0);
          const legend = SEGMENTS.map((key) => s.count(counts[key], s.labels[key] ?? key)).join(", ");

          return (
            <li key={concept.concept_id} className="flex flex-col gap-3 p-5 sm:p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-display text-xl">{concept.name}</span>
                <span className="font-mono text-xs tabular-nums text-ink-muted">
                  {s.seats(total)}
                </span>
              </div>

              {total > 0 ? (
                <div
                  role="img"
                  aria-label={legend}
                  className="flex h-3 overflow-hidden rounded-full bg-surface-sunken"
                >
                  {SEGMENTS.map((key) =>
                    counts[key] > 0 ? (
                      <div
                        key={key}
                        className={SEGMENT_CLASS[key]}
                        style={{ width: `${(counts[key] / total) * 100}%` }}
                      />
                    ) : null,
                  )}
                </div>
              ) : null}

              <ul className="flex flex-wrap gap-x-5 gap-y-1 text-xs tabular-nums text-ink-muted">
                {SEGMENTS.map((key) => (
                  <li key={key} className="flex items-center gap-1.5">
                    <span aria-hidden="true" className={`size-2.5 rounded-sm ${SEGMENT_CLASS[key]}`} />
                    {s.count(counts[key], s.labels[key] ?? key)}
                  </li>
                ))}
              </ul>

              <div className="flex flex-col gap-1 border-t border-rule-line pt-3">
                <h3 className="text-xs font-medium tracking-wide text-ink-muted uppercase">
                  {s.gaps}
                </h3>
                {(concept.gaps ?? []).length > 0 ? (
                  <ul className="flex flex-col gap-1">
                    {(concept.gaps ?? []).map((gap, index) => (
                      <li key={index} className="text-sm text-ink">
                        {gap}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-ink-muted">{s.gapsEmpty}</p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
