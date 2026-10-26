import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { getCourse } from "@/lib/api/courses";
import { getCourseChallenge } from "@/lib/api/marketplace-authoring";
import { requireProfessor } from "@/lib/professor-session";
import { ProfessorShell } from "../../../../professor-shell";
import { signOut } from "../../../../sign-in/actions";
import { strings } from "../../../../strings";
import { updateChallengeAction } from "../actions";
import { ChallengeForm } from "../challenge-form";

// Editing a challenge (decision 0112). The count of committed selections is
// shown in the eyebrow, because an edit under a cohort that has already
// committed is a thing a professor should know they are doing.
export default async function EditChallengePage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string; challengeId: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { token, email } = await requireProfessor();
  const { courseId, challengeId } = await params;
  const { saved, error } = await searchParams;
  const id = Number(courseId);
  const cid = Number(challengeId);
  if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(cid) || cid <= 0) notFound();
  const course = await getCourse(token, id);
  if (!course) notFound();
  const found = await getCourseChallenge(token, id, cid);
  if (!found.ok) notFound();
  const s = strings.challenges;
  const challenge = found.data;

  return (
    <ProfessorShell
      email={email}
      signOut={signOut}
      course={{ id, title: course.title, section: "challenges" }}
    >
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-10">
        <PageHeader
          back={{ href: `/courses/${id}/challenges`, label: s.back }}
          eyebrow={
            <span className="flex flex-wrap items-center gap-2">
              <Badge tone={challenge.status === "published" ? "accent" : undefined}>
                {challenge.status === "published" ? s.published : s.draft}
              </Badge>
              <span className="text-sm text-ink-muted">
                {s.colCommitted}: {challenge.selection_count}
              </span>
            </span>
          }
          title={s.formTitleEdit}
        />
        {saved ? (
          <p role="status" className="text-sm text-ink-muted">
            {s.saved}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-flag-amber">
            {s.error}
          </p>
        ) : null}
        <ChallengeForm action={updateChallengeAction.bind(null, id, cid)} challenge={challenge} />
      </main>
    </ProfessorShell>
  );
}
