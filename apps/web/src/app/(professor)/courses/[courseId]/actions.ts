"use server";

import { revalidatePath } from "next/cache";

import { createCaseStudy, setCaseStudyPublished } from "@/lib/api/case-studies";
import { requireProfessor } from "@/lib/professor-session";

// Authoring mutations run server-side so the professor JWT never reaches the
// client (decision 0012); each revalidates the course page so the new draft or
// changed status shows at once. courseId (and the case study id) are bound in
// the form, with the FormData appended last.
export async function createCaseStudyAction(courseId: number, formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "");
  if (!title || !body.trim()) return;
  const { token } = await requireProfessor();
  await createCaseStudy(token, courseId, { title, body });
  revalidatePath(`/courses/${courseId}`);
}

export async function setPublishedAction(
  courseId: number,
  caseStudyId: number,
  published: boolean,
) {
  const { token } = await requireProfessor();
  await setCaseStudyPublished(token, courseId, caseStudyId, published);
  revalidatePath(`/courses/${courseId}`);
}
