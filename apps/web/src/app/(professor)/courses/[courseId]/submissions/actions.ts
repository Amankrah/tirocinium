"use server";

// The review surface's authed calls, run server-side so the professor JWT never
// reaches the client (decision 0012). Grading is a mutation that also writes
// mastery evidence, so it revalidates the queue and the detail: a grade changes
// what both of them show.
import { revalidatePath } from "next/cache";

import type { Schemas } from "@/lib/api/client";
import { gradeSubmission, listSubmissions, refreshPage } from "@/lib/api/review";
import { requireProfessor } from "@/lib/professor-session";

export async function listSubmissionsAction(
  courseId: number,
  options: { status?: string; cursor?: number; limit?: number } = {},
): Promise<Schemas["SubmissionListOut"] | null> {
  const { token } = await requireProfessor();
  return listSubmissions(token, courseId, options);
}

export async function refreshPageAction(
  courseId: number,
  submissionId: number,
  pageIndex: number,
): Promise<Schemas["PageRenditionsOut"] | null> {
  const { token } = await requireProfessor();
  return refreshPage(token, courseId, submissionId, pageIndex);
}

export async function gradeSubmissionAction(
  courseId: number,
  submissionId: number,
  score: number,
): Promise<Schemas["GradeOut"] | null> {
  const { token } = await requireProfessor();
  const result = await gradeSubmission(token, courseId, submissionId, score);
  if (result) {
    revalidatePath(`/courses/${courseId}/submissions`);
    revalidatePath(`/courses/${courseId}/submissions/${submissionId}`);
  }
  return result;
}
