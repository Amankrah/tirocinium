import { notFound } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
import { getCourse } from "@/lib/api/courses";
import { requireProfessor } from "@/lib/professor-session";
import { ProfessorShell } from "../../../professor-shell";
import { signOut } from "../../../sign-in/actions";
import { strings } from "../../../strings";
import {
  completeImportAction,
  createImportAction,
  getImportAction,
} from "./actions";
import { ImportPanel } from "./import-panel";

// The import-from-PDF surface (guide 4.3). A Server Component shell: it proves
// the professor owns the course (getCourse is owner-scoped, so a non-owner or
// unknown course is a 404) and hands the panel the three authed actions.
export default async function ImportPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { token, email } = await requireProfessor();
  const { courseId } = await params;
  const id = Number(courseId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const course = await getCourse(token, id);
  if (!course) notFound();

  return (
    <ProfessorShell
      email={email}
      signOut={signOut}
      course={{ id, title: course.title, section: "import" }}
    >
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-10">
        <PageHeader title={strings.import.title} description={strings.import.intro} />
        <ImportPanel
          courseId={id}
          create={createImportAction}
          complete={completeImportAction}
          poll={getImportAction}
        />
      </main>
    </ProfessorShell>
  );
}
