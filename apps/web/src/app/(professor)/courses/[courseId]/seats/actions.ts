"use server";

import { revalidatePath } from "next/cache";

import type { Schemas } from "@/lib/api/client";
import { generateSeatBatch, reissueSeat, revokeSeat } from "@/lib/api/seats";
import { requireProfessor } from "@/lib/professor-session";

// Seat mutations run server-side so the professor JWT never reaches the client
// (decision 0012). Generate and reissue return their payloads to the calling
// island, because a plaintext code (in the batch files or a reissue) is shown
// exactly once and there is nowhere else to read it. courseId (and the seat id)
// are bound in the page.

export type GenerateState = {
  batch: Schemas["SeatBatchOut"] | null;
  error: boolean;
};

export async function generateSeatsAction(
  courseId: number,
  formData: FormData,
): Promise<GenerateState> {
  const count = Number(formData.get("count"));
  if (!Number.isInteger(count) || count < 1 || count > 500) {
    return { batch: null, error: true };
  }
  const { token } = await requireProfessor();
  const batch = await generateSeatBatch(token, courseId, count);
  if (!batch) return { batch: null, error: true };
  revalidatePath(`/courses/${courseId}/seats`);
  return { batch, error: false };
}

export async function revokeSeatAction(courseId: number, seatId: number) {
  const { token } = await requireProfessor();
  await revokeSeat(token, seatId);
  revalidatePath(`/courses/${courseId}/seats`);
}

export type ReissueState = { code: string | null; error: boolean };

export async function reissueSeatAction(
  courseId: number,
  seatId: number,
): Promise<ReissueState> {
  const { token } = await requireProfessor();
  const out = await reissueSeat(token, seatId);
  if (!out) return { code: null, error: true };
  revalidatePath(`/courses/${courseId}/seats`);
  return { code: out.code, error: false };
}
