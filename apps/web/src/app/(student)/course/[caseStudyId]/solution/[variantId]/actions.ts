"use server";

// The unfold's one mutation, run server-side so the seat token stays out of
// client JavaScript (decision 0011). `through_step` is absolute, which is what
// makes a retry safe: it can only ever move forward.
import { cookies } from "next/headers";

import type { FigureMap } from "@/components/reading/problem-body";
import type { Schemas } from "@/lib/api/client";
import { resolveFiguresForBodies } from "@/lib/api/figures";
import { SEAT_COOKIE } from "@/lib/api/session";
import { revealThrough } from "@/lib/api/unfold";

// A revealed step can carry a figure at its token position, and resolving one
// needs the seat token, so the pixels travel with the step rather than leaving
// the client island to fetch what it holds no credential for (decision 0068).
export type RevealedUnfold = {
  unfold: Schemas["UnfoldOut"];
  figures: FigureMap;
};

export async function revealAction(
  courseId: number,
  variantId: number,
  throughStep: number,
): Promise<RevealedUnfold | null> {
  const token = (await cookies()).get(SEAT_COOKIE)?.value;
  if (!token) return null;
  const unfold = await revealThrough(token, courseId, variantId, throughStep);
  if (!unfold) return null;
  return {
    unfold,
    figures: await resolveFiguresForBodies(
      token,
      courseId,
      unfold.steps.map((step) => step.markdown),
    ),
  };
}
