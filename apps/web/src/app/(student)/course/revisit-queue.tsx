import Link from "next/link";

import { Icon } from "@/components/ui/icon";
import type { Schemas } from "@/lib/api/client";
import { strings } from "../strings";

// The revisit queue on course home (mastery spec 6, guide 4.2b): the platform's
// one proactive gesture, presented calmly. One targeted variant per concept, no
// nagging, no off-platform notification. An empty queue is the normal state and
// renders nothing. A null variant shows the concept without a call to action
// rather than hiding it. A Server Component.
//
// A quiet accent tint rather than a raised card (decision 0102): this is the
// one place the platform speaks first, so it reads as a note in the margin, not
// an alert.
const s = strings.revisit;

export function RevisitQueue({
  revisit,
}: {
  revisit: Schemas["RevisitOut"];
}) {
  if (revisit.concepts.length === 0) return null;

  return (
    <section
      aria-labelledby="revisit-heading"
      className="flex flex-col gap-4 rounded-lg border border-accent/20 bg-accent-soft p-5 sm:p-6"
    >
      <h2 id="revisit-heading" className="flex items-center gap-2 font-display text-xl">
        <Icon name="refresh" size={16} className="text-accent-text" />
        {s.heading(revisit.concepts.length)}
      </h2>
      <ul className="flex flex-col divide-y divide-accent/15">
        {revisit.concepts.map((concept) => (
          <li
            key={concept.concept_id}
            className="flex flex-wrap items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
          >
            <span className="text-ink">{concept.name}</span>
            {concept.variant ? (
              <Link
                href={`/course/${concept.variant.case_study_id}`}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-link rounded-sm"
              >
                {s.practise}: {concept.variant.case_study_title}
                <Icon name="arrow-right" size={14} />
              </Link>
            ) : (
              <span className="text-sm text-ink-muted">{s.noVariant}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
