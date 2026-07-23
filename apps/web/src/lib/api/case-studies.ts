// Case study reads for the student surfaces (backend 2.1). Server-side only,
// carrying the seat token; the backend returns published case studies to a seat
// and drafts only to their professor, so these functions see exactly what the
// seat may see. All shapes come from the generated client (frontend guide 7).
import { apiBaseUrl, type Schemas } from "./client";

export async function listCaseStudies(
  token: string,
  courseId: number,
): Promise<Schemas["CaseStudySummary"][]> {
  let response: Response;
  try {
    response = await fetch(
      `${apiBaseUrl()}/api/v1/courses/${courseId}/case-studies`,
      { headers: { authorization: `Bearer ${token}` }, cache: "no-store" },
    );
  } catch {
    return [];
  }
  if (!response.ok) return [];
  const data = (await response.json()) as Schemas["CaseStudyListOut"];
  return data.items;
}

export async function getCaseStudy(
  token: string,
  courseId: number,
  caseStudyId: number,
): Promise<Schemas["CaseStudyDetail"] | null> {
  let response: Response;
  try {
    response = await fetch(
      `${apiBaseUrl()}/api/v1/courses/${courseId}/case-studies/${caseStudyId}`,
      { headers: { authorization: `Bearer ${token}` }, cache: "no-store" },
    );
  } catch {
    return null;
  }
  if (!response.ok) return null;
  return (await response.json()) as Schemas["CaseStudyDetail"];
}

// Authoring writes (professor token). Create returns the new draft; publish and
// unpublish flip its status. The backend enforces ownership, so a professor can
// only ever touch their own course.
export async function createCaseStudy(
  token: string,
  courseId: number,
  input: Schemas["CaseStudyIn"],
): Promise<Schemas["CaseStudyDetail"] | null> {
  let response: Response;
  try {
    response = await fetch(
      `${apiBaseUrl()}/api/v1/courses/${courseId}/case-studies`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(input),
        cache: "no-store",
      },
    );
  } catch {
    return null;
  }
  if (!response.ok) return null;
  return (await response.json()) as Schemas["CaseStudyDetail"];
}

export async function setCaseStudyPublished(
  token: string,
  courseId: number,
  caseStudyId: number,
  published: boolean,
): Promise<boolean> {
  const action = published ? "publish" : "unpublish";
  try {
    const response = await fetch(
      `${apiBaseUrl()}/api/v1/courses/${courseId}/case-studies/${caseStudyId}/${action}`,
      { method: "POST", headers: { authorization: `Bearer ${token}` }, cache: "no-store" },
    );
    return response.ok;
  } catch {
    return false;
  }
}
