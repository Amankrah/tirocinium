import { notFound } from "next/navigation";

import { ProblemBody } from "@/components/reading/problem-body";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { getCaseStudy } from "@/lib/api/case-studies";
import { resolveFigures } from "@/lib/api/figures";
import { getPracticeVariant } from "@/lib/api/practice";
import { listChallenges } from "@/lib/api/marketplace";
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
  searchParams: Promise<{ variant?: string; attempt?: string; selection?: string }>;
}) {
  const { token, seat } = await requireSeat();
  const { caseStudyId } = await params;
  const { variant, attempt, selection } = await searchParams;

  const caseId = Number(caseStudyId);
  const variantId = Number(variant);
  if (!Number.isInteger(caseId) || caseId <= 0) notFound();
  if (!Number.isInteger(variantId) || variantId <= 0) notFound();
  // A missing or malformed attempt is simply no attempt: a stale id from a
  // reloaded page costs the span, never the submission (decision 0058).
  const attemptId = Number(attempt);
  const attemptToCite =
    Number.isInteger(attemptId) && attemptId > 0 ? attemptId : null;
  // The project selections this seat has committed, offered for citation
  // (decision 0112); a marketplace that cannot be read offers none.
  const challenges = await listChallenges(token);
  const selections = challenges.ok
    ? challenges.data
        .filter((entry) => entry.committed && entry.selection_id !== null)
        .map((entry) => ({
          id: entry.selection_id as number,
          reference: entry.reference ?? "",
          title: entry.title,
        }))
    : [];
  const selectionId = Number(selection);
  const selectionToCite =
    Number.isInteger(selectionId) && selectionId > 0 ? selectionId : null;

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
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-10 sm:px-6">
        {/* The page is the task, so the task is the heading (guide 4.1, and
            what the upload journeys look for); the problem's title sits above
            it as the eyebrow. The panel takes the heading over only while it
            is sending or marking, when the task has changed. */}
        <PageHeader
          back={{ href: `/course/${caseId}`, label: strings.upload.back }}
          eyebrow={<span className="font-display text-base text-ink">{caseStudy.title}</span>}
          title={strings.upload.title}
        />
        {/* The problem recap: a recess the student can scroll inside, so the
            question stays within reach while the sheet below is the work. */}
        <Card
          as="section"
          tone="sunken"
          aria-label={strings.upload.question}
          // A region that scrolls must be reachable by keyboard (WCAG 2.1.1);
          // on a phone the recap overflows its 40vh and axe asks for this.
          tabIndex={0}
          className="max-h-[40vh] overflow-y-auto overscroll-contain focus-ring"
        >
          <div className="max-w-[var(--measure-reading)]">
            <ProblemBody body={body} figures={figures} />
          </div>
        </Card>
        <UploadPanel
          variantId={variantId}
          caseStudyId={caseId}
          attemptId={attemptToCite}
          selections={selections}
          selectionId={selectionToCite}
          create={createSubmissionAction}
          complete={completeSubmissionAction}
        />
      </main>
    </StudentShell>
  );
}
