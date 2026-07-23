import Link from "next/link";
import { notFound } from "next/navigation";

import { ProblemBody } from "@/components/reading/problem-body";
import { getCaseStudy } from "@/lib/api/case-studies";
import { requireProfessor } from "@/lib/professor-session";
import { ProfessorShell } from "../../../../professor-shell";
import { signOut } from "../../../../sign-in/actions";
import { strings } from "../../../../strings";

// The professor's preview of a case study, published or draft, rendered through
// the same ProblemBody a seat would read (decision 0014) so what the professor
// checks is exactly what a student gets.
export default async function CaseStudyPreviewPage({
  params,
}: {
  params: Promise<{ courseId: string; caseStudyId: string }>;
}) {
  const { token, email } = await requireProfessor();
  const { courseId, caseStudyId } = await params;
  const cid = Number(courseId);
  const csid = Number(caseStudyId);
  if (!Number.isInteger(cid) || !Number.isInteger(csid)) notFound();

  const caseStudy = await getCaseStudy(token, cid, csid);
  if (!caseStudy) notFound();
  const published = caseStudy.status === "published";

  return (
    <ProfessorShell email={email} signOut={signOut}>
      <article className="mx-auto flex w-full max-w-[var(--measure-reading)] flex-col gap-6 px-6 py-12">
        <Link
          href={`/courses/${cid}`}
          className="text-sm text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {strings.course.back}
        </Link>
        <header className="flex flex-col gap-3">
          <span
            className={
              published ? "text-xs text-verify-green" : "text-xs text-ink-muted"
            }
          >
            {published ? strings.course.published : strings.course.draft}
          </span>
          <h1 className="font-display text-4xl">{caseStudy.title}</h1>
        </header>
        <ProblemBody body={caseStudy.body} />
      </article>
    </ProfessorShell>
  );
}
