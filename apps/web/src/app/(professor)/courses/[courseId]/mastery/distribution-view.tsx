import type { Schemas } from "@/lib/api/client";
import { strings } from "../../../strings";

// The professor's per-concept distribution (mastery spec 6, guide 4.2b): the
// class's relationship to the material, not a leaderboard of people. Anonymous
// counts only. The bar is a single-hue intensity ramp, calm and free of any
// good/bad judgment; the counts are also given as text and the bar carries an
// accessible label. A Server Component. The gaps slot is designed but empty
// until Phase 7's defenses name misconceptions verbatim.
const s = strings.distribution;
const SEGMENTS = ["unseen", "shaky", "developing", "solid"] as const;
type Segment = (typeof SEGMENTS)[number];
const SEGMENT_CLASS: Record<Segment, string> = {
  unseen: "bg-rule-line",
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
    return <p className="text-sm text-ink-muted">{s.empty}</p>;
  }

  return (
    <ul className="flex flex-col gap-6">
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
          <li key={concept.concept_id} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-ink">{concept.name}</span>
              <span className="text-xs text-ink-muted">{s.seats(total)}</span>
            </div>

            {total > 0 ? (
              <div
                role="img"
                aria-label={legend}
                className="flex h-3 overflow-hidden rounded-full border border-rule-line"
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

            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
              {SEGMENTS.map((key) => (
                <li key={key}>{s.count(counts[key], s.labels[key] ?? key)}</li>
              ))}
            </ul>

            <div className="flex flex-col gap-1">
              <h3 className="text-xs uppercase tracking-widest text-ink-muted">
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
  );
}
