import type { Schemas } from "@/lib/api/client";
import { MasteryLabel } from "./mastery-label";
import { strings } from "../strings";

// The mastery picture on course home (mastery spec 4.5, guide 4.2b): a calm,
// honest per-concept view of getting better, each label expandable to its
// evidence. No streaks, no ranking, no colour hierarchy. A Server Component.
const s = strings.mastery;

export function MasteryPicture({
  mastery,
}: {
  mastery: Schemas["MasteryOut"];
}) {
  if (mastery.concepts.length === 0) {
    return (
      <section className="flex flex-col gap-3">
        <h2 className="font-display text-2xl">{s.heading}</h2>
        <p className="text-sm text-ink-muted">{s.empty}</p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-2xl">{s.heading}</h2>
      <ul className="flex flex-col divide-y divide-rule-line">
        {mastery.concepts.map((concept) => (
          <li
            key={concept.concept_id}
            className="flex flex-wrap items-start justify-between gap-3 py-3"
          >
            <div className="flex flex-col gap-0.5">
              <span className="text-ink">{concept.name}</span>
              {concept.description ? (
                <span className="text-xs text-ink-muted">{concept.description}</span>
              ) : null}
            </div>
            <div className="flex flex-col items-end gap-1">
              <MasteryLabel label={concept.label} trail={concept.trail} />
              {concept.due_for_revisit ? (
                <span className="text-xs text-ink-muted">{s.dueForRevisit}</span>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
