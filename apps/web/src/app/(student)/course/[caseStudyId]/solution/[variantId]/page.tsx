import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { ProblemBody } from "@/components/reading/problem-body";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { getCaseStudy } from "@/lib/api/case-studies";
import { resolveFiguresForBodies } from "@/lib/api/figures";
import { getPracticeVariant } from "@/lib/api/practice";
import { getHistory, getUnfold } from "@/lib/api/unfold";
import { requireSeat } from "@/lib/seat-session";
import { StudentShell } from "../../../../student-shell";
import { strings } from "../../../../strings";
import { revealAction } from "./actions";
import { SolutionQuestion } from "./solution-question";
import { UnfoldPanel } from "./unfold-panel";

// The understanding unfold (guide 4.2, milestone 8.4). A Server Component that
// proves the seat, asks whether the solution has been earned, and hands the
// client island the reveal action.
//
// A 403 from the read is a state rather than a failure: the seat has neither
// submitted nor given up, so the surface names both ways in. Reading it without
// attempting is a legitimate choice and is offered plainly, because a first
// reveal without a submission is exactly what records giving up, and the
// platform never pretends a solution was earned by work that did not happen.
export default async function SolutionPage({
  params,
}: {
  params: Promise<{ caseStudyId: string; variantId: string }>;
}) {
  const { seat, token } = await requireSeat();
  const { caseStudyId, variantId } = await params;

  const caseId = Number(caseStudyId);
  const vid = Number(variantId);
  if (!Number.isInteger(caseId) || caseId <= 0) notFound();
  if (!Number.isInteger(vid) || vid <= 0) notFound();

  const [result, caseStudy, pinned] = await Promise.all([
    getUnfold(token, seat.course_id, vid),
    getCaseStudy(token, seat.course_id, caseId),
    // The question this solution answers, pinned to the variant on screen
    // rather than drawn again from the pool (decision 0093, the same read the
    // writing page uses). A pin that cannot be read falls back to the case
    // study body, so the steps are never shown against a blank.
    getPracticeVariant(token, seat.course_id, caseId, null, vid),
  ]);
  const s = strings.unfold;
  const questionBody = pinned?.body ?? caseStudy?.body ?? null;

  // The tutor reads a submission, not a variant, so a step can only be sent
  // into a conversation when this seat has a processed submission for this
  // variant. History is the one seat-readable place that join lives.
  // The steps already out are typeset here rather than in the island, so the
  // solution is in the HTML and the markdown engine never reaches this route
  // unless a student reveals another step (decision 0068). Figures in the
  // question and the steps resolve together.
  const figures = await resolveFiguresForBodies(token, seat.course_id, [
    questionBody,
    ...(result.ok ? result.unfold.steps.map((step) => step.markdown) : []),
  ]);
  let rendered: Record<number, ReactNode> = {};
  if (result.ok) {
    rendered = Object.fromEntries(
      result.unfold.steps.map((step) => [
        step.number,
        <ProblemBody key={step.number} body={step.markdown} figures={figures} />,
      ]),
    );
  }

  let defenceHref: string | null = null;
  if (result.ok) {
    const history = await getHistory(token, seat.course_id, { limit: 50 });
    const entry = history?.entries.find(
      (candidate) =>
        candidate.variant_id === vid && candidate.status === "processed",
    );
    if (entry) {
      defenceHref = `/course/${caseId}/defence/${entry.submission_id}`;
    }
  }

  return (
    <StudentShell seatNumber={seat.seat_number}>
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-10 sm:px-6">
        <PageHeader
          back={{ href: `/course/${caseId}`, label: s.back }}
          title={s.title}
          size="lg"
        />

        {questionBody ? (
          <SolutionQuestion
            title={caseStudy?.title ?? null}
            body={questionBody}
            figures={figures}
          />
        ) : null}

        {result.ok ? (
          <UnfoldPanel
            variantId={vid}
            initial={result.unfold}
            initialRendered={rendered}
            reveal={revealAction.bind(null, seat.course_id)}
            defenceHref={defenceHref}
          />
        ) : result.reason === "not_earned" ? (
          <Card tone="raised" className="flex flex-col gap-5">
            <p className="max-w-prose text-pretty text-ink-muted">{s.notEarned}</p>
            <div className="flex flex-wrap items-center gap-3">
              <ButtonLink href={`/course/${caseId}/upload?variant=${vid}`}>
                <Icon name="upload" size={16} />
                {s.submitInstead}
              </ButtonLink>
              {/* Giving up is a choice the student makes deliberately, and the
                  first reveal without a submission is what records it. */}
              <GiveUpLink caseStudyId={caseId} variantId={vid} />
            </div>
          </Card>
        ) : (
          <p className="text-ink-muted">{s.unavailable}</p>
        )}
      </main>
    </StudentShell>
  );
}

// A plain form posting the first reveal, so giving up needs no client
// JavaScript and is a deliberate submit rather than a stray click.
function GiveUpLink({
  caseStudyId,
  variantId,
}: {
  caseStudyId: number;
  variantId: number;
}) {
  return (
    <form
      action={async () => {
        "use server";
        const { seat } = await requireSeat();
        await revealAction(seat.course_id, variantId, 1);
        const { redirect } = await import("next/navigation");
        redirect(`/course/${caseStudyId}/solution/${variantId}`);
      }}
    >
      <Button type="submit" variant="secondary">
        {strings.unfold.giveUp}
      </Button>
    </form>
  );
}
