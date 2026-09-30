"use server";

import { revalidatePath } from "next/cache";

import { setShortlist, type Shortlist } from "@/lib/api/marketplace-authoring";
import type { Result } from "@/lib/api/client";
import { requireProfessor } from "@/lib/professor-session";

// The shortlist write, proxied so the professor JWT stays server-side
// (decision 0012). The whole list goes over at once in the order shown, because
// order is what the shortlist means: the first line is the one a student meets
// first. The result comes back rather than a boolean, since the backend reports
// which SKUs this catalogue version no longer carries and the editor says so.
export async function saveShortlistAction(
  courseId: number,
  caseStudyId: number,
  skus: string[],
): Promise<Result<Shortlist>> {
  const { token } = await requireProfessor();
  const result = await setShortlist(token, courseId, caseStudyId, skus);
  revalidatePath(`/courses/${courseId}/case-studies/${caseStudyId}/shortlist`);
  revalidatePath(`/courses/${courseId}/materials`);
  return result;
}
