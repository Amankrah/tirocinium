import Link from "next/link";
import { notFound } from "next/navigation";

import { ProblemBody } from "@/components/reading/problem-body";
import { Button } from "@/components/ui/button";
import { getCaseStudy } from "@/lib/api/case-studies";
import { requireSeat } from "@/lib/seat-session";
import { StudentShell } from "../../student-shell";
import { strings } from "../../strings";

// The problem view (guide 4.1): the case study body typeset in the reading
// column, its concept tags, and the action rail. A Server Component; the body
// renders server-side (decision 0014). A case study the seat may not see (a
// draft, or another course) comes back null and is a 404, never a leak.
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

  return (
    <StudentShell seatNumber={seat.seat_number}>
      <article className="mx-auto flex w-full max-w-[var(--measure-reading)] flex-col gap-6 px-6 py-12">
        <Link
          href="/course"
          className="text-sm text-ink/60 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
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

        <ProblemBody body={caseStudy.body} />

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-rule-line pt-6">
          <Button disabled>{strings.problem.newVariant}</Button>
          <Button variant="quiet" disabled>
            {strings.problem.upload}
          </Button>
          <span className="text-xs text-ink/50">{strings.problem.soon}</span>
        </div>
      </article>
    </StudentShell>
  );
}
