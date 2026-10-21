import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { getCourse } from "@/lib/api/courses";
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

  const [course, review] = await Promise.all([
    getCourse(token, cid),
    getSubmissionReview(token, cid, sid),
  ]);
  if (!course || !review) notFound();

  const s = strings.submissions;

  return (
    <ProfessorShell
      email={email}
      signOut={signOut}
      course={{ id: cid, title: course.title, section: "submissions" }}
    >
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-10">
        {/* The seat number is the only thing about the student anywhere on
            this surface, which is the whole identity model (guide 4.0). */}
        <PageHeader
          back={{ href: `/courses/${cid}/submissions`, label: s.backToQueue }}
          eyebrow={
            <>
              <span className="tabular-nums">{s.pages(review.pages.length)}</span>
              {review.recognition_conf !== null ? (
                <Badge mono>{s.confidence(Math.round(review.recognition_conf * 100))}</Badge>
              ) : null}
            </>
          }
          title={s.detailHeading(review.seat_number)}
          description={review.case_study_title}
        />
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
