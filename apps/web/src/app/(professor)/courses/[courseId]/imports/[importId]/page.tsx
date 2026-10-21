import { notFound } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
import { getCourse } from "@/lib/api/courses";
import { getImportItems } from "@/lib/api/imports";
import { requireProfessor } from "@/lib/professor-session";
import { ProfessorShell } from "../../../../professor-shell";
import { signOut } from "../../../../sign-in/actions";
import { strings } from "../../../../strings";
import {
  addFigureFromBoxAction,
  confirmItemAction,
  discardItemAction,
  getImportItemsAction,
  mergeItemsAction,
  removeFigureAction,
  setFigureRoleAction,
} from "./actions";
import { ConfirmReview } from "./confirm-review";

// The import confirmation surface (guide 4.3). A Server Component shell: it
// proves the professor owns the course, does the first items read server-side,
// and hands the review island its data and the verb actions. The read is
// owner-scoped and an unknown import is a 404, never a leak.
export default async function ImportReviewPage({
  params,
}: {
  params: Promise<{ courseId: string; importId: string }>;
}) {
  const { token, email } = await requireProfessor();
  const { courseId, importId } = await params;
  const cId = Number(courseId);
  const iId = Number(importId);
  if (!Number.isInteger(cId) || cId <= 0) notFound();
  if (!Number.isInteger(iId) || iId <= 0) notFound();

  const course = await getCourse(token, cId);
  if (!course) notFound();
  const items = await getImportItems(token, cId, iId);
  if (!items) notFound();

  return (
    <ProfessorShell
      email={email}
      signOut={signOut}
      course={{ id: cId, title: course.title, section: "import" }}
    >
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-10">
        <PageHeader
          back={{ href: `/courses/${cId}/import`, label: strings.confirm.backToImport }}
          title={strings.confirm.title}
        />
        <ConfirmReview
          courseId={cId}
          importId={iId}
          initial={items}
          confirm={confirmItemAction}
          discard={discardItemAction}
          refetch={getImportItemsAction}
          addBox={addFigureFromBoxAction}
          setRole={setFigureRoleAction}
          removeFig={removeFigureAction}
          merge={mergeItemsAction}
        />
      </main>
    </ProfessorShell>
  );
}
