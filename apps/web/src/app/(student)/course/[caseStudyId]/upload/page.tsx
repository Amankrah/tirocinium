import Link from "next/link";
import { notFound } from "next/navigation";

import { requireSeat } from "@/lib/seat-session";
import { StudentShell } from "../../../student-shell";
import { strings } from "../../../strings";
import { completeSubmissionAction, createSubmissionAction } from "./actions";
import { UploadPanel } from "./upload-panel";

// The upload surface (guide 4.1). A Server Component shell around the client
// panel: it proves the seat, resolves the variant to file against, and hands
// the panel the two authed server actions. The variant comes from the query
// because exposing a variant pool to the problem view is a Phase 5 concern
// (decision 0019); a seat provides it out of band until then, so a missing or
// bad variant is a 404 rather than a broken form.
export default async function UploadPage({
  params,
  searchParams,
}: {
  params: Promise<{ caseStudyId: string }>;
  searchParams: Promise<{ variant?: string }>;
}) {
  const { seat } = await requireSeat();
  const { caseStudyId } = await params;
  const { variant } = await searchParams;

  const caseId = Number(caseStudyId);
  const variantId = Number(variant);
  if (!Number.isInteger(caseId) || caseId <= 0) notFound();
  if (!Number.isInteger(variantId) || variantId <= 0) notFound();

  return (
    <StudentShell seatNumber={seat.seat_number}>
      <div className="mx-auto flex w-full max-w-[var(--measure-reading)] flex-col gap-6 px-6 py-12">
        <Link
          href={`/course/${caseId}`}
          className="text-sm text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {strings.upload.back}
        </Link>
        <h1 className="font-display text-4xl">{strings.upload.title}</h1>
        <UploadPanel
          variantId={variantId}
          create={createSubmissionAction}
          complete={completeSubmissionAction}
        />
      </div>
    </StudentShell>
  );
}
