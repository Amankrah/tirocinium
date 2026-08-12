import Link from "next/link";
import { notFound } from "next/navigation";

import { getCourse } from "@/lib/api/courses";
import { listSubmissions } from "@/lib/api/review";
import { requireProfessor } from "@/lib/professor-session";
import { ProfessorShell } from "../../../professor-shell";
import { signOut } from "../../../sign-in/actions";
import { strings } from "../../../strings";
import { listSubmissionsAction } from "./actions";
import { SubmissionQueue } from "./submission-queue";

// The review queue (guide 4.4, milestone 8.1). A Server Component that proves
// ownership and renders the first page; the client island below it carries the
// keyboard model, the status filter, and paging.
export default async function SubmissionsPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { token, email } = await requireProfessor();
  const { courseId } = await params;
  const cid = Number(courseId);
  if (!Number.isInteger(cid) || cid <= 0) notFound();

  const course = await getCourse(token, cid);
  if (!course) notFound();
  const page = await listSubmissions(token, cid);
  if (!page) notFound();

  const s = strings.submissions;

  return (
    <ProfessorShell email={email} signOut={signOut}>
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-12">
        <div className="flex flex-col gap-2">
          <Link
            href={`/courses/${cid}`}
            className="text-sm text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {s.back}
          </Link>
          <h1 className="font-display text-4xl">{s.heading}</h1>
        </div>
        <SubmissionQueue
          courseId={cid}
          initial={page}
          list={listSubmissionsAction}
        />
      </main>
    </ProfessorShell>
  );
}
