import Link from "next/link";

import type { Schemas } from "@/lib/api/client";
import { strings } from "../strings";

// Course home as a clean index (guide 4.1): each published case study by title,
// its concept tags, and a personal-state stub. Presentational, so it is unit
// tested directly; the page fetches and passes the items.
export function CaseStudyIndex({
  items,
}: {
  items: Schemas["CaseStudySummary"][];
}) {
  if (items.length === 0) {
    return <p className="text-ink/70">{strings.course.empty}</p>;
  }
  return (
    <ul className="flex flex-col divide-y divide-rule-line">
      {items.map((item) => (
        <li key={item.id}>
          <Link
            href={`/course/${item.id}`}
            className="flex flex-col gap-2 py-5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <span className="font-display text-xl">{item.title}</span>
            <span className="flex flex-wrap items-center gap-2">
              {item.concepts.map((concept) => (
                <span
                  key={concept.concept_id}
                  className="rounded-full border border-rule-line px-2.5 py-0.5 text-xs text-ink/70"
                >
                  {concept.name}
                </span>
              ))}
              <span className="text-xs text-ink-muted">
                {strings.course.notAttempted}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
