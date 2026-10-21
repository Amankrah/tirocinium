import { notFound } from "next/navigation";

import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { getCaseStudy } from "@/lib/api/case-studies";
import { getCourse } from "@/lib/api/courses";
import {
  getAuthoringCatalogue,
  getShortlist,
} from "@/lib/api/marketplace-authoring";
import { requireProfessor } from "@/lib/professor-session";
import { ProfessorShell } from "../../../../../professor-shell";
import { signOut } from "../../../../../sign-in/actions";
import { strings } from "../../../../../strings";
import { saveShortlistAction } from "./actions";
import { ShortlistEditor } from "./shortlist-editor";

// The shortlist editor's shell (Phase 10, decision 0076): it proves the
// professor owns the course, reads the pinned catalogue and the current
// shortlist, and hands the editor its data and its one verb.
//
// A course with no catalogue answers 409 on the catalogue read. That is not a
// failure and does not get an error: the professor simply has a decision to
// make first, so the page says which one and links to it.
export default async function ShortlistPage({
  params,
}: {
  params: Promise<{ courseId: string; caseStudyId: string }>;
}) {
  const { token, email } = await requireProfessor();
  const { courseId, caseStudyId } = await params;
  const cid = Number(courseId);
  const csid = Number(caseStudyId);
  if (!Number.isInteger(cid) || cid <= 0) notFound();
  if (!Number.isInteger(csid) || csid <= 0) notFound();

  const [course, caseStudy] = await Promise.all([
    getCourse(token, cid),
    getCaseStudy(token, cid, csid),
  ]);
  if (!course || !caseStudy) notFound();

  const s = strings.shortlist;
  const catalogue = await getAuthoringCatalogue(token, cid, csid);

  return (
    <ProfessorShell
      email={email}
      signOut={signOut}
      course={{ id: cid, title: course.title, section: "overview" }}
    >
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-10">
        <PageHeader
          back={{ href: `/courses/${cid}/case-studies/${csid}`, label: s.back }}
          eyebrow={<span>{caseStudy.title}</span>}
          title={s.title}
          description={catalogue.ok ? s.intro : undefined}
        />

        {!catalogue.ok ? (
          <EmptyState
            icon="store"
            body={catalogue.status === 409 ? s.unpinned : strings.materials.error}
            action={
              <ButtonLink href={`/courses/${cid}/materials`} variant="secondary">
                {s.chooseCatalogue}
              </ButtonLink>
            }
          />
        ) : (
          <ShortlistEditor
            courseId={cid}
            caseStudyId={csid}
            catalogue={catalogue.data}
            initial={await getShortlist(token, cid, csid).then((result) =>
              result.ok ? result.data.skus : [],
            )}
            save={saveShortlistAction}
          />
        )}
      </main>
    </ProfessorShell>
  );
}
