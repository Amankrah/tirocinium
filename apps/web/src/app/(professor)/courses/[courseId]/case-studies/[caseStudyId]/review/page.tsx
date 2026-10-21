import { notFound } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
import { getCourse } from "@/lib/api/courses";
import { listVariants } from "@/lib/api/variants";
import { requireProfessor } from "@/lib/professor-session";
import { ProfessorShell } from "../../../../../professor-shell";
import { signOut } from "../../../../../sign-in/actions";
import { strings } from "../../../../../strings";
import {
  deleteVariantAction,
  editVariantAction,
  getVariantAction,
  listVariantsAction,
  promoteVariantAction,
} from "../variant-actions";
import { ReviewQueue } from "./review-queue";

// The flagged-variant review queue (guide 4.4). A Server Component shell: it
// proves the professor owns the course, does the first flagged read server-side,
// and hands the queue its data and verbs. The queue is the page's first list,
// which the keyboard journey relies on to find it.
export default async function ReviewPage({
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

  const course = await getCourse(token, cid);
  if (!course) notFound();
  const flagged = await listVariants(token, cid, csid, { state: "flagged" });
  if (!flagged) notFound();

  return (
    <ProfessorShell
      email={email}
      signOut={signOut}
      course={{ id: cid, title: course.title, section: "overview" }}
    >
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-10">
        <PageHeader
          back={{
            href: `/courses/${cid}/case-studies/${csid}`,
            label: strings.variants.reviewBack,
          }}
          title={strings.variants.reviewTitle}
        />
        <ReviewQueue
          courseId={cid}
          caseStudyId={csid}
          initial={flagged}
          get={getVariantAction}
          promote={promoteVariantAction}
          edit={editVariantAction}
          remove={deleteVariantAction}
          refetch={listVariantsAction}
        />
      </main>
    </ProfessorShell>
  );
}
