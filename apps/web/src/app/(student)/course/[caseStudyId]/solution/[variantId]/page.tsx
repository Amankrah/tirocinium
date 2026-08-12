import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { ProblemBody } from "@/components/reading/problem-body";
import { resolveFiguresForBodies } from "@/lib/api/figures";
import { getHistory, getUnfold } from "@/lib/api/unfold";
import { requireSeat } from "@/lib/seat-session";
import { StudentShell } from "../../../../student-shell";
import { strings } from "../../../../strings";
import { revealAction } from "./actions";
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

  const result = await getUnfold(token, seat.course_id, vid);
  const s = strings.unfold;

  // The tutor reads a submission, not a variant, so a step can only be sent
  // into a conversation when this seat has a processed submission for this
  // variant. History is the one seat-readable place that join lives.
  // The steps already out are typeset here rather than in the island, so the
  // solution is in the HTML and the markdown engine never reaches this route
  // unless a student reveals another step (decision 0068).
  let rendered: Record<number, ReactNode> = {};
  if (result.ok) {
    const figures = await resolveFiguresForBodies(
      token,
      seat.course_id,
      result.unfold.steps.map((step) => step.markdown),
    );
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
      <div className="mx-auto flex w-full max-w-[var(--measure-reading)] flex-col gap-8 px-6 py-12">
        <Link
          href={`/course/${caseId}`}
          className="text-sm text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {s.back}
        </Link>
        <h1 className="font-display text-4xl">{s.title}</h1>

        {result.ok ? (
          <UnfoldPanel
            variantId={vid}
            initial={result.unfold}
            initialRendered={rendered}
            reveal={revealAction.bind(null, seat.course_id)}
            defenceHref={defenceHref}
          />
        ) : result.reason === "not_earned" ? (
          <div className="flex flex-col gap-4">
            <p className="text-ink-muted">{s.notEarned}</p>
            <div className="flex flex-wrap gap-3">
              <Link
                href={`/course/${caseId}/upload?variant=${vid}`}
                className="inline-flex items-center justify-center rounded-md bg-accent px-4 py-2 font-medium text-on-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {s.submitInstead}
              </Link>
              {/* Giving up is a choice the student makes deliberately, and the
                  first reveal without a submission is what records it. */}
              <GiveUpLink caseStudyId={caseId} variantId={vid} />
            </div>
          </div>
        ) : (
          <p className="text-ink-muted">{s.unavailable}</p>
        )}
      </div>
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
      <button
        type="submit"
        className="inline-flex items-center justify-center rounded-md border border-rule-line px-4 py-2 font-medium text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {strings.unfold.giveUp}
      </button>
    </form>
  );
}
