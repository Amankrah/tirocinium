"use server";

import { redirect } from "next/navigation";

import { createCourse } from "@/lib/api/courses";
import { requireProfessor } from "@/lib/professor-session";

// Creating a course is a server action so the professor JWT stays server-side
// (decision 0012). On success we go straight into the new course's page.
export async function createCourseAction(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;
  const { token } = await requireProfessor();
  const course = await createCourse(token, title);
  if (course) redirect(`/courses/${course.id}`);
}
