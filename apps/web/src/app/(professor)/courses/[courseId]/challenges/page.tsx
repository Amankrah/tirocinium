import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { getCourse } from "@/lib/api/courses";
import { listCourseChallenges } from "@/lib/api/marketplace-authoring";
import { requireProfessor } from "@/lib/professor-session";
import { ProfessorShell } from "../../../professor-shell";
import { signOut } from "../../../sign-in/actions";
import { strings } from "../../../strings";
import { deleteChallengeAction, setChallengeStatusAction } from "./actions";

// The professor's project challenges (decision 0112): a list, with publish,
// unpublish and delete as forms posting server actions. A Server Component
// start to finish, like the materials page.
export default async function ChallengesPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { token, email } = await requireProfessor();
  const { courseId } = await params;
  const id = Number(courseId);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const course = await getCourse(token, id);
  if (!course) notFound();
  const s = strings.challenges;
  const challenges = await listCourseChallenges(token, id);

  return (
    <ProfessorShell
      email={email}
      signOut={signOut}
      course={{ id, title: course.title, section: "challenges" }}
    >
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-4 py-8 sm:px-6 lg:px-10">
        <PageHeader
          title={s.title}
          description={s.intro}
          actions={
            <ButtonLink href={`/courses/${id}/challenges/new`}>
              <Icon name="plus" size={14} />
              {s.newChallenge}
            </ButtonLink>
          }
        />
        {!challenges.ok ? (
          <p role="alert" className="text-sm text-flag-amber">
            {strings.materials.error}
          </p>
        ) : challenges.data.length === 0 ? (
          <EmptyState icon="book" body={s.none} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{s.colTitle}</Th>
                <Th>{s.colStatus}</Th>
                <Th justify="end">{s.colCommitted}</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {challenges.data.map((challenge) => (
                <Tr key={challenge.id}>
                  <Td>
                    <ButtonLink
                      href={`/courses/${id}/challenges/${challenge.id}`}
                      variant="quiet"
                      size="sm"
                    >
                      {challenge.title}
                    </ButtonLink>
                  </Td>
                  <Td>
                    <Badge tone={challenge.status === "published" ? "accent" : undefined}>
                      {challenge.status === "published" ? s.published : s.draft}
                    </Badge>
                  </Td>
                  <Td justify="end" numeric>
                    {challenge.selection_count}
                  </Td>
                  <Td justify="end">
                    <div className="flex flex-wrap justify-end gap-2">
                      <form
                        action={setChallengeStatusAction.bind(
                          null,
                          id,
                          challenge.id,
                          challenge.status === "published" ? "draft" : "published",
                        )}
                      >
                        <Button type="submit" variant="secondary" size="sm">
                          {challenge.status === "published" ? s.unpublish : s.publish}
                        </Button>
                      </form>
                      {challenge.selection_count === 0 ? (
                        <form action={deleteChallengeAction.bind(null, id, challenge.id)}>
                          <Button type="submit" variant="quiet" size="sm">
                            {s.remove}
                          </Button>
                        </form>
                      ) : (
                        <span className="self-center text-xs text-ink-muted">{s.removeBlocked}</span>
                      )}
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </main>
    </ProfessorShell>
  );
}
