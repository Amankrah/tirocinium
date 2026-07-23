// Course reads and writes for the professor authoring surface (backend 2.1).
// Server-side only, carrying the professor JWT; the backend returns a
// professor's own courses (admins see all). Shapes from the generated client.
import { apiBaseUrl, type Schemas } from "./client";

export async function listCourses(
  token: string,
): Promise<Schemas["CourseOut"][]> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}/api/v1/courses`, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch {
    return [];
  }
  if (!response.ok) return [];
  const data = (await response.json()) as Schemas["CourseListOut"];
  return data.courses;
}

export async function getCourse(
  token: string,
  courseId: number,
): Promise<Schemas["CourseOut"] | null> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}/api/v1/courses/${courseId}`, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  return (await response.json()) as Schemas["CourseOut"];
}

export async function createCourse(
  token: string,
  title: string,
): Promise<Schemas["CourseOut"] | null> {
  const body: Schemas["CourseIn"] = { title };
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}/api/v1/courses`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  return (await response.json()) as Schemas["CourseOut"];
}
