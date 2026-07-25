import Link from "next/link";
import { notFound } from "next/navigation";

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
// and hands the queue its data and verbs.
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
    <ProfessorShell email={email} signOut={signOut}>
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-12">
        <div className="flex flex-col gap-2">
          <Link
            href={`/courses/${cid}/case-studies/${csid}`}
            className="text-sm text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {strings.variants.reviewBack}
          </Link>
          <h1 className="font-display text-4xl">{strings.variants.reviewTitle}</h1>
        </div>
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
