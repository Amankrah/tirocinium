"use server";

// The practice loop's variant swap, run server-side so the seat token stays out
// of client JavaScript (decision 0011). The seat's course comes from its own
// session, so the client passes only the case study and the variant to avoid.
import type { FigureMap } from "@/components/reading/problem-body";
import { startAttempt } from "@/lib/api/attempts";
import type { Schemas } from "@/lib/api/client";
import { resolveFigures } from "@/lib/api/figures";
import { getPracticeVariant } from "@/lib/api/practice";
import { requireSeat } from "@/lib/seat-session";

// The swapped variant travels with its figures already resolved, because the
// resolve carries the seat token and so has to happen here rather than in the
// client island (decision 0066). A swapped variant is a problem like any other:
// its diagrams render as pixels at their token position, not as a marker.
export type SwappedVariant = {
  variant: Schemas["PracticeVariantOut"];
  figures: FigureMap;
};

export async function getPracticeVariantAction(
  caseStudyId: number,
  exclude: number | null,
): Promise<SwappedVariant | null> {
  const { token, seat } = await requireSeat();
  const variant = await getPracticeVariant(
    token,
    seat.course_id,
    caseStudyId,
    exclude,
  );
  if (!variant) return null;
  return {
    variant,
    figures: await resolveFigures(token, seat.course_id, variant.body),
  };
}

// The "start attempt" moment of guide 4.2: the student says they are beginning,
// and the server stamps it (decision 0058). The id comes back so the upload can
// cite it; nothing about the time crosses the wire in either direction.
export async function startAttemptAction(
  variantId: number,
): Promise<Schemas["AttemptOut"] | null> {
  const { token } = await requireSeat();
  return startAttempt(token, variantId);
}
