import Link from "next/link";
import { notFound } from "next/navigation";

import { ProblemBody } from "@/components/reading/problem-body";
import { getCaseStudy } from "@/lib/api/case-studies";
import { resolveFigures } from "@/lib/api/figures";
import { getParamSpec } from "@/lib/api/params";
import { requireProfessor } from "@/lib/professor-session";
import { ProfessorShell } from "../../../../professor-shell";
import { signOut } from "../../../../sign-in/actions";
import { strings } from "../../../../strings";
import {
  autoParameterizeAction,
  deleteParamSpecAction,
  saveParamSpecAction,
} from "./param-actions";
import { ParamPanel } from "./param-panel";
import {
  generateVariantsAction,
  getVariantAction,
  listVariantsAction,
} from "./variant-actions";
import { VariantPreview } from "./variant-preview";

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
  // A draft straight out of an import carries its figures as fig:// tokens, and
  // this is the surface where the professor judges whether the platform kept
  // their diagram (guide 4.3), so the pixels are resolved before it renders
  // rather than left to the unresolved branch (decision 0066).
  const [spec, figures] = await Promise.all([
    getParamSpec(token, cid, csid),
    resolveFigures(token, cid, caseStudy.body),
  ]);

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
        <ProblemBody body={caseStudy.body} figures={figures} />
        <ParamPanel
          courseId={cid}
          caseStudyId={csid}
          body={caseStudy.body}
          initial={spec}
          save={saveParamSpecAction}
          clear={deleteParamSpecAction}
          propose={autoParameterizeAction}
        />
        <VariantPreview
          courseId={cid}
          caseStudyId={csid}
          generate={generateVariantsAction}
          list={listVariantsAction}
          get={getVariantAction}
        />
      </article>
    </ProfessorShell>
  );
}
