"use server";

// The authed half of the PDF import, run server-side so the professor JWT never
// reaches client JavaScript (decision 0012). The client controller calls these
// for create, complete, and the status poll; the PDF bytes it PUTs straight to
// storage never pass through here. A lapsed session redirects to sign-in via
// requireProfessor.
import type { Schemas } from "@/lib/api/client";
import { completeImport, createImport, getImport } from "@/lib/api/imports";
import { requireProfessor } from "@/lib/professor-session";

export async function createImportAction(
  courseId: number,
  sizeBytes: number,
  idempotencyKey: string,
): Promise<Schemas["ImportCreated"] | null> {
  const { token } = await requireProfessor();
  return createImport(token, courseId, sizeBytes, idempotencyKey);
}

export async function completeImportAction(
  courseId: number,
  importId: number,
): Promise<boolean> {
  const { token } = await requireProfessor();
  const result = await completeImport(token, courseId, importId);
  return result !== null;
}

export async function getImportAction(
  courseId: number,
  importId: number,
): Promise<Schemas["ImportOut"] | null> {
  const { token } = await requireProfessor();
  return getImport(token, courseId, importId);
}
