"use server";

// The authed half of the upload flow, run server-side so the seat token stays
// out of client JavaScript (decision 0019). The client controller calls these
// for create and complete; the page bytes it PUTs straight to storage never
// pass through here. A missing cookie collapses to the same null/false the
// backend failures already map to, so the client has one thing to handle.
import { cookies } from "next/headers";

import type { Schemas } from "@/lib/api/client";
import { SEAT_COOKIE } from "@/lib/api/session";
import { completeSubmission, createSubmission } from "@/lib/api/submissions";

export async function createSubmissionAction(
  variantId: number,
  pages: Schemas["PageIn"][],
  idempotencyKey: string,
): Promise<Schemas["SubmissionCreated"] | null> {
  const token = (await cookies()).get(SEAT_COOKIE)?.value;
  if (!token) return null;
  return createSubmission(token, variantId, pages, idempotencyKey);
}

export async function completeSubmissionAction(
  submissionId: number,
): Promise<boolean> {
  const token = (await cookies()).get(SEAT_COOKIE)?.value;
  if (!token) return false;
  const result = await completeSubmission(token, submissionId);
  return result !== null;
}
