"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  createCourseChallenge,
  deleteCourseChallenge,
  getCourseChallenge,
  updateCourseChallenge,
} from "@/lib/api/marketplace-authoring";
import { requireProfessor } from "@/lib/professor-session";
import { parseChallengeForm } from "./parse";

// Challenge authoring runs server-side so the professor JWT never reaches the
// client (decision 0012). The form is plain HTML: requirements, constraints
// and the shortlist arrive one per line, and a requirement's target follows a
// pipe. Parsing lives here so the page stays a Server Component.

export async function createChallengeAction(courseId: number, formData: FormData) {
  const publish = formData.get("intent") === "publish";
  const body = parseChallengeForm(formData, publish ? "published" : "draft");
  if (!body.title || (body.requirements ?? []).length === 0) return;
  const { token } = await requireProfessor();
  const result = await createCourseChallenge(token, courseId, body);
  revalidatePath(`/courses/${courseId}/challenges`);
  if (result.ok) {
    redirect(`/courses/${courseId}/challenges/${result.data.id}?saved=1`);
  }
  redirect(`/courses/${courseId}/challenges/new?error=1`);
}

export async function updateChallengeAction(
  courseId: number,
  challengeId: number,
  formData: FormData,
) {
  const publish = formData.get("intent") === "publish";
  const { token } = await requireProfessor();
  const current = await getCourseChallenge(token, courseId, challengeId);
  const status = publish ? "published" : current.ok ? current.data.status : "draft";
  const body = parseChallengeForm(formData, status);
  if (!body.title || (body.requirements ?? []).length === 0) return;
  const result = await updateCourseChallenge(token, courseId, challengeId, body);
  revalidatePath(`/courses/${courseId}/challenges`);
  redirect(`/courses/${courseId}/challenges/${challengeId}?${result.ok ? "saved=1" : "error=1"}`);
}

export async function setChallengeStatusAction(
  courseId: number,
  challengeId: number,
  status: "draft" | "published",
) {
  const { token } = await requireProfessor();
  const current = await getCourseChallenge(token, courseId, challengeId);
  if (!current.ok) return;
  const c = current.data;
  await updateCourseChallenge(token, courseId, challengeId, {
    title: c.title,
    context: c.context,
    requirements: c.requirements,
    constraints: c.constraints,
    deliverable: c.deliverable,
    weights: c.weights,
    candidate_families: c.candidate_families,
    shortlist: c.shortlist,
    status,
  });
  revalidatePath(`/courses/${courseId}/challenges`);
}

export async function deleteChallengeAction(courseId: number, challengeId: number) {
  const { token } = await requireProfessor();
  await deleteCourseChallenge(token, courseId, challengeId);
  revalidatePath(`/courses/${courseId}/challenges`);
}
