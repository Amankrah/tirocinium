import { notFound } from "next/navigation";

import { ProblemBody } from "@/components/reading/problem-body";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { getCaseStudy } from "@/lib/api/case-studies";
import { getCourse } from "@/lib/api/courses";
import { resolveFigures } from "@/lib/api/figures";
import { listCatalogues } from "@/lib/api/marketplace-authoring";
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
// checks is exactly what a student gets. The body sits on a raised sheet at the
// reading measure; the parameter panel and the preview variants follow at the
// page's full width (decision 0102).
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

  const [course, caseStudy] = await Promise.all([
    getCourse(token, cid),
    getCaseStudy(token, cid, csid),
  ]);
  if (!course || !caseStudy) notFound();
  const published = caseStudy.status === "published";
  // A draft straight out of an import carries its figures as fig:// tokens, and
  // this is the surface where the professor judges whether the platform kept
  // their diagram (guide 4.3), so the pixels are resolved before it renders
  // rather than left to the unresolved branch (decision 0066).
  const [spec, figures] = await Promise.all([
    getParamSpec(token, cid, csid),
    resolveFigures(token, cid, caseStudy.body),
  ]);
  // The shortlist link only appears for a course that prices materials, since
  // for every other course it would lead to a decision they have not made.
  const catalogues = await listCatalogues(token, cid);
  const pricesMaterials = catalogues.ok && catalogues.data.pinned !== null;

  return (
    <ProfessorShell
      email={email}
      signOut={signOut}
      course={{ id: cid, title: course.title, section: "overview" }}
    >
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-10">
        <PageHeader
          back={{ href: `/courses/${cid}`, label: strings.course.backToCourse }}
          eyebrow={
            <Badge tone={published ? "green" : "neutral"}>
              {published ? strings.course.published : strings.course.draft}
            </Badge>
          }
          title={caseStudy.title}
          actions={
            pricesMaterials ? (
              <ButtonLink
                href={`/courses/${cid}/case-studies/${csid}/shortlist`}
                variant="secondary"
              >
                <Icon name="store" size={16} />
                {strings.course.shortlistLink}
              </ButtonLink>
            ) : undefined
          }
        />
        <Card as="article" className="w-full max-w-[calc(var(--measure-reading)+3rem)]">
          <ProblemBody body={caseStudy.body} figures={figures} />
        </Card>
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
      </main>
    </ProfessorShell>
  );
}
