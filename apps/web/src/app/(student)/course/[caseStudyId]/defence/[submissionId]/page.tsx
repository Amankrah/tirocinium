import Link from "next/link";
import { notFound } from "next/navigation";

import { ProblemBody } from "@/components/reading/problem-body";
import { getMastery, getRevisit } from "@/lib/api/mastery";
import { getSubmission, getSubmissionTranscription } from "@/lib/api/submissions";
import { requireSeat } from "@/lib/seat-session";
import { StudentShell } from "../../../../student-shell";
import { strings } from "../../../../strings";
import { openDefenceAction } from "./actions";
import { DefencePanel } from "./defence-panel";
import type { RevisitTarget } from "./defence-session";

// The voice defence (guide 4.2, milestone 7.4). A Server Component: it proves
// the seat, checks the submission is actually readable (the conversation is
// about what the student wrote, so it opens only once that has been read),
// renders their own work beside the invitation, and hands the client island one
// bound server action.
//
// The variant's own body is not here: no seat-readable endpoint returns a named
// variant, which decision 0055 flags against frontend guide 2's rule that a
// figure renders on every surface showing a problem. The student's
// transcription is seat-readable and is what the conversation is about.
export default async function DefencePage({
  params,
  searchParams,
}: {
  params: Promise<{ caseStudyId: string; submissionId: string }>;
  // A step sent in from the understanding unfold (guide 4.2), which opens the
  // answer box already written rather than sending anything on the student's
  // behalf.
  searchParams: Promise<{ step?: string }>;
}) {
  const { seat, token } = await requireSeat();
  const { caseStudyId, submissionId } = await params;
  const { step } = await searchParams;

  const caseId = Number(caseStudyId);
  const id = Number(submissionId);
  if (!Number.isInteger(caseId) || caseId <= 0) notFound();
  if (!Number.isInteger(id) || id <= 0) notFound();

  // Another seat's submission is a 404 from the backend, which collapses to
  // null here and stays a 404, so existence never leaks.
  const submission = await getSubmission(token, id);
  if (!submission) notFound();

  const ready = submission.status === "processed";
  const [transcription, mastery, revisit] = await Promise.all([
    ready ? getSubmissionTranscription(token, id) : Promise.resolve(null),
    ready ? getMastery(token, seat.course_id) : Promise.resolve(null),
    ready ? getRevisit(token, seat.course_id) : Promise.resolve(null),
  ]);

  // The verdict names a concept id; mastery supplies every concept's name and
  // the revisit queue supplies the fresh variant for the ones it targets, which
  // together let the closing line name the gap and offer the practice.
  const variants = new Map(
    (revisit?.concepts ?? []).map((concept) => [concept.concept_id, concept.variant]),
  );
  const targets: RevisitTarget[] = (mastery?.concepts ?? []).map((concept) => {
    const variant = variants.get(concept.concept_id) ?? null;
    return {
      conceptId: concept.concept_id,
      name: concept.name,
      caseStudyId: variant?.case_study_id ?? null,
      caseStudyTitle: variant?.case_study_title ?? null,
    };
  });

  const s = strings.defence;

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

        {ready ? (
          <DefencePanel
            open={openDefenceAction.bind(null, id)}
            revisit={targets}
            initialQuestion={
              step ? `I do not understand this step: ${step}` : undefined
            }
          />
        ) : (
          <p className="text-ink-muted">{s.notReady}</p>
        )}

        {transcription && transcription.recognized_markdown ? (
          <section className="flex flex-col gap-3 border-t border-rule-line pt-6">
            <h2 className="font-display text-xl">{s.yourWork}</h2>
            <ProblemBody body={transcription.recognized_markdown} />
          </section>
        ) : null}
      </div>
    </StudentShell>
  );
}
