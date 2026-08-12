import Link from "next/link";

import type { Schemas } from "@/lib/api/client";
import { strings } from "../strings";

// The revisit queue on course home (mastery spec 6, guide 4.2b): the platform's
// one proactive gesture, presented calmly. One targeted variant per concept, no
// nagging, no off-platform notification. An empty queue is the normal state and
// renders nothing. A null variant shows the concept without a call to action
// rather than hiding it. A Server Component.
const s = strings.revisit;

export function RevisitQueue({
  revisit,
}: {
  revisit: Schemas["RevisitOut"];
}) {
  if (revisit.concepts.length === 0) return null;

  return (
    <section className="flex flex-col gap-3 rounded-md border border-rule-line p-4">
      <h2 className="font-display text-xl">{s.heading(revisit.concepts.length)}</h2>
      <ul className="flex flex-col gap-2">
        {revisit.concepts.map((concept) => (
          <li
            key={concept.concept_id}
            className="flex flex-wrap items-center justify-between gap-3"
          >
            <span className="text-ink">{concept.name}</span>
            {concept.variant ? (
              <Link
                href={`/course/${concept.variant.case_study_id}`}
                className="text-sm text-accent-text underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {s.practise}: {concept.variant.case_study_title}
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
