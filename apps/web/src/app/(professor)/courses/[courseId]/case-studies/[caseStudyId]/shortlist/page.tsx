import Link from "next/link";
import { notFound } from "next/navigation";

import { getCaseStudy } from "@/lib/api/case-studies";
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

// The shortlist editor's shell (Phase 10, decision 0062): it proves the
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

  const caseStudy = await getCaseStudy(token, cid, csid);
  if (!caseStudy) notFound();

  const s = strings.shortlist;
  const catalogue = await getAuthoringCatalogue(token, cid, csid);

  return (
    <ProfessorShell email={email} signOut={signOut}>
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-12">
        <div className="flex flex-col gap-2">
          <Link
            href={`/courses/${cid}/case-studies/${csid}`}
            className="text-sm text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {s.back}
          </Link>
          <h1 className="font-display text-4xl">{s.title}</h1>
          <p className="text-ink-muted">{caseStudy.title}</p>
        </div>

        {!catalogue.ok ? (
          <div className="flex flex-col gap-3">
            <p className="max-w-[var(--measure-reading)] text-ink-muted">
              {catalogue.status === 409 ? s.unpinned : strings.materials.error}
            </p>
            <Link
              href={`/courses/${cid}/materials`}
              className="text-sm text-accent underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {s.chooseCatalogue}
            </Link>
          </div>
        ) : (
          <>
            <p className="max-w-[var(--measure-reading)] text-sm text-ink-muted">
              {s.intro}
            </p>
            <ShortlistEditor
              courseId={cid}
              caseStudyId={csid}
              catalogue={catalogue.data}
              initial={await getShortlist(token, cid, csid).then((result) =>
                result.ok ? result.data.skus : [],
              )}
              save={saveShortlistAction}
            />
          </>
        )}
      </main>
    </ProfessorShell>
  );
}
