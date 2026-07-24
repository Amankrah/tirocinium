import Link from "next/link";
import { notFound } from "next/navigation";

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
    <ProfessorShell email={email} signOut={signOut}>
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-12">
        <div className="flex flex-col gap-2">
          <Link
            href={`/courses/${id}`}
            className="text-sm text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {strings.import.back}
          </Link>
          <h1 className="font-display text-4xl">{strings.import.title}</h1>
        </div>
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
