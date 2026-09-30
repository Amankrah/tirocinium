"use server";

import { revalidatePath } from "next/cache";

import { pinCatalogue } from "@/lib/api/marketplace-authoring";
import { requireProfessor } from "@/lib/professor-session";

// Choosing a catalogue version runs server-side so the professor JWT never
// reaches the client (decision 0012). The arguments are bound in the form and
// the FormData is appended last, which is the pattern the rest of the group
// uses; nothing here reads it.
export async function pinCatalogueAction(
  courseId: number,
  catalogueId: string,
  version: number,
) {
  const { token } = await requireProfessor();
  await pinCatalogue(token, courseId, { id: catalogueId, version });
  revalidatePath(`/courses/${courseId}/materials`);
}

// Unpinning hides the marketplace from students and leaves every issued
// quotation alone: each names its own catalogue version and never needed the
// course to agree.
export async function unpinCatalogueAction(courseId: number) {
  const { token } = await requireProfessor();
  await pinCatalogue(token, courseId, null);
  revalidatePath(`/courses/${courseId}/materials`);
}
