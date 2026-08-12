import Link from "next/link";
import { notFound } from "next/navigation";

import { ProblemBody } from "@/components/reading/problem-body";
import { getCaseStudy } from "@/lib/api/case-studies";
import { resolveFigures } from "@/lib/api/figures";
import { getPracticeVariant } from "@/lib/api/practice";
import { requireSeat } from "@/lib/seat-session";
import { StudentShell } from "../../student-shell";
import { strings } from "../../strings";
import { getPracticeVariantAction, startAttemptAction } from "./actions";
import { PracticeProblem } from "./practice-problem";

// The problem view (guide 4.1): the current pooled variant typeset in the reading
// column, its concept tags, and the action rail. A Server Component; the first
// variant body renders server-side (decision 0014), and "New variant" swaps in
// another from the pool instantly. A case study the seat may not see (a draft, or
// another course) comes back null and is a 404, never a leak.
export default async function ProblemViewPage({
  params,
}: {
  params: Promise<{ caseStudyId: string }>;
}) {
  const { token, seat } = await requireSeat();
  const { caseStudyId } = await params;
  const id = Number(caseStudyId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const caseStudy = await getCaseStudy(token, seat.course_id, id);
  if (!caseStudy) notFound();

  // The pool serves a variant instantly; its body reads identically to the base
  // when the pool is empty (variant_id null). A failed call falls back to base.
  const practice = await getPracticeVariant(token, seat.course_id, id, null);
  const body = practice?.body ?? caseStudy.body;
  const variantId = practice?.variant_id ?? null;
  // Generation preserves the base's fig:// tokens by a fidelity check (decision
  // 0038), so a variant body carries the professor's diagrams exactly as the
  // base does and the seat sees the pixels either way (decision 0066).
  const figures = await resolveFigures(token, seat.course_id, body);

  return (
    <StudentShell seatNumber={seat.seat_number}>
      <article className="mx-auto flex w-full max-w-[var(--measure-reading)] flex-col gap-6 px-6 py-12">
        <Link
          href="/course"
          className="text-sm text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {strings.problem.backToCourse}
        </Link>

        <header className="flex flex-col gap-3">
          <h1 className="font-display text-4xl">{caseStudy.title}</h1>
          {caseStudy.concepts.length > 0 ? (
            <ul
              aria-label={strings.problem.concepts}
              className="flex flex-wrap gap-2"
            >
              {caseStudy.concepts.map((concept) => (
                <li
                  key={concept.concept_id}
                  className="rounded-full border border-rule-line px-2.5 py-0.5 text-xs text-ink/70"
                >
                  {concept.name}
                </li>
              ))}
            </ul>
          ) : null}
        </header>

        <PracticeProblem
          caseStudyId={id}
          initialVariantId={variantId}
          swap={getPracticeVariantAction}
          startAttempt={startAttemptAction}
        >
          <ProblemBody body={body} figures={figures} />
        </PracticeProblem>
      </article>
    </StudentShell>
  );
}
