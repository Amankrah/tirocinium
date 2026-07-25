"use server";

// The practice loop's variant swap, run server-side so the seat token stays out
// of client JavaScript (decision 0011). The seat's course comes from its own
// session, so the client passes only the case study and the variant to avoid.
import type { Schemas } from "@/lib/api/client";
import { getPracticeVariant } from "@/lib/api/practice";
import { requireSeat } from "@/lib/seat-session";

export async function getPracticeVariantAction(
  caseStudyId: number,
  exclude: number | null,
): Promise<Schemas["PracticeVariantOut"] | null> {
  const { token, seat } = await requireSeat();
  return getPracticeVariant(token, seat.course_id, caseStudyId, exclude);
}
