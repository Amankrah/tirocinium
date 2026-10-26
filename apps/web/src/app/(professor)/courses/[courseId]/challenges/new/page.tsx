import { notFound } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
import { getCourse } from "@/lib/api/courses";
import { requireProfessor } from "@/lib/professor-session";
import { ProfessorShell } from "../../../../professor-shell";
import { signOut } from "../../../../sign-in/actions";
import { strings } from "../../../../strings";
import { createChallengeAction } from "../actions";
import { ChallengeForm } from "../challenge-form";

// Writing a new challenge (decision 0112).
export default async function NewChallengePage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token, email } = await requireProfessor();
  const { courseId } = await params;
  const { error } = await searchParams;
  const id = Number(courseId);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const course = await getCourse(token, id);
  if (!course) notFound();
  const s = strings.challenges;

  return (
    <ProfessorShell
      email={email}
      signOut={signOut}
      course={{ id, title: course.title, section: "challenges" }}
    >
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-10">
        <PageHeader
          back={{ href: `/courses/${id}/challenges`, label: s.back }}
          title={s.formTitleNew}
        />
        {error ? (
          <p role="alert" className="text-sm text-flag-amber">
            {s.error}
          </p>
        ) : null}
        <ChallengeForm action={createChallengeAction.bind(null, id)} challenge={null} />
      </main>
    </ProfessorShell>
  );
}
