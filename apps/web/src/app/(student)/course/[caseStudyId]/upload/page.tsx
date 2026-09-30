import Link from "next/link";
import { notFound } from "next/navigation";

import { ProblemBody } from "@/components/reading/problem-body";
import { getCaseStudy } from "@/lib/api/case-studies";
import { resolveFigures } from "@/lib/api/figures";
import { getPracticeVariant } from "@/lib/api/practice";
import { requireSeat } from "@/lib/seat-session";
import { StudentShell } from "../../../student-shell";
import { strings } from "../../../strings";
import { completeSubmissionAction, createSubmissionAction } from "./actions";
import { UploadPanel } from "./upload-panel";

// The upload surface (guide 4.1, decision 0080). A Server Component shell
// around the client panel: it proves the seat, keeps the question they started
// on the page, and hands the panel the two authed server actions. A missing or
// bad variant is a 404 rather than a blank form.
export default async function UploadPage({
  params,
  searchParams,
}: {
  params: Promise<{ caseStudyId: string }>;
  searchParams: Promise<{ variant?: string; attempt?: string }>;
}) {
  const { token, seat } = await requireSeat();
  const { caseStudyId } = await params;
  const { variant, attempt } = await searchParams;

  const caseId = Number(caseStudyId);
  const variantId = Number(variant);
  if (!Number.isInteger(caseId) || caseId <= 0) notFound();
  if (!Number.isInteger(variantId) || variantId <= 0) notFound();
  // A missing or malformed attempt is simply no attempt: a stale id from a
  // reloaded page costs the span, never the submission (decision 0058).
  const attemptId = Number(attempt);
  const attemptToCite =
    Number.isInteger(attemptId) && attemptId > 0 ? attemptId : null;

  // The question the student just started, not a fresh draw from the pool
  // (decision 0080). A pin that cannot be read falls back to the case study
  // itself, so the page is never a blank sheet.
  const caseStudy = await getCaseStudy(token, seat.course_id, caseId);
  if (!caseStudy) notFound();
  const pinned = await getPracticeVariant(
    token,
    seat.course_id,
    caseId,
    null,
    variantId,
  );
  const body = pinned?.body ?? caseStudy.body;
  const figures = await resolveFigures(token, seat.course_id, body);

  return (
    <StudentShell seatNumber={seat.seat_number}>
      <div className="mx-auto flex w-full max-w-[var(--measure-reading)] flex-col gap-6 px-6 py-12">
        <Link
          href={`/course/${caseId}`}
          className="text-sm text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {strings.upload.back}
        </Link>
        <section
          aria-label={strings.upload.question}
          className="flex max-h-[40vh] flex-col gap-4 overflow-y-auto rounded-md border border-rule-line px-5 py-5"
        >
          <h1 className="font-display text-3xl">{caseStudy.title}</h1>
          <ProblemBody body={body} figures={figures} />
        </section>
        <h2 className="font-display text-4xl">{strings.upload.title}</h2>
        <UploadPanel
          variantId={variantId}
          caseStudyId={caseId}
          attemptId={attemptToCite}
          create={createSubmissionAction}
          complete={completeSubmissionAction}
        />
      </div>
    </StudentShell>
  );
}
