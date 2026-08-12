import Link from "next/link";
import { notFound } from "next/navigation";

import { getSubmissionReview } from "@/lib/api/review";
import { requireProfessor } from "@/lib/professor-session";
import { ProfessorShell } from "../../../../professor-shell";
import { signOut } from "../../../../sign-in/actions";
import { strings } from "../../../../strings";
import { gradeSubmissionAction, refreshPageAction } from "../actions";
import { SubmissionReview } from "./submission-review";

// One submission under review (guide 4.4, milestone 8.1). A Server Component
// that reads the scan beside its transcription and hands the client island the
// two authed actions. Another course's submission is a 404 from the backend and
// stays a 404 here, so existence never leaks.
export default async function SubmissionReviewPage({
  params,
}: {
  params: Promise<{ courseId: string; submissionId: string }>;
}) {
  const { token, email } = await requireProfessor();
  const { courseId, submissionId } = await params;
  const cid = Number(courseId);
  const sid = Number(submissionId);
  if (!Number.isInteger(cid) || cid <= 0) notFound();
  if (!Number.isInteger(sid) || sid <= 0) notFound();

  const review = await getSubmissionReview(token, cid, sid);
  if (!review) notFound();

  const s = strings.submissions;

  return (
    <ProfessorShell email={email} signOut={signOut}>
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-12">
        <div className="flex flex-col gap-2">
          <Link
            href={`/courses/${cid}/submissions`}
            className="text-sm text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {s.backToQueue}
          </Link>
          {/* The seat number is the only thing about the student anywhere on
              this surface, which is the whole identity model (guide 4.0). */}
          <h1 className="font-display text-4xl">{s.detailHeading(review.seat_number)}</h1>
          <p className="text-ink-muted">{review.case_study_title}</p>
          <p className="text-sm text-ink-muted">
            {s.pages(review.pages.length)}
            {review.recognition_conf !== null
              ? ` · ${s.confidence(Math.round(review.recognition_conf * 100))}`
              : ""}
          </p>
        </div>
        <SubmissionReview
          courseId={cid}
          review={review}
          refresh={refreshPageAction}
          grade={gradeSubmissionAction}
        />
      </main>
    </ProfessorShell>
  );
}
