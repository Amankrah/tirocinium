// Case study reads for the student surfaces (backend 2.1). Server-side only,
// carrying the seat token; the backend returns published case studies to a seat
// and drafts only to their professor, so these functions see exactly what the
// seat may see. All shapes come from the generated client (frontend guide 7).
import { apiBaseUrl, type Schemas } from "./client";

// The list endpoint pages (default 50, ceiling 100) and reports the next
// cursor. Callers that only need a first look keep the short form; the course
// home walks every page, because a seat must be able to reach every published
// problem (decision 0083).
const LIST_PAGE_LIMIT = 100;
const LIST_PAGE_CAP = 50;

export async function listCaseStudyPage(
  token: string,
  courseId: number,
  options: { cursor?: number; limit?: number } = {},
): Promise<Schemas["CaseStudyListOut"] | null> {
  const query = new URLSearchParams();
  if (options.cursor != null) query.set("cursor", String(options.cursor));
  if (options.limit != null) query.set("limit", String(options.limit));
  const text = query.toString();
  const suffix = text ? `?${text}` : "";
  let response: Response;
  try {
    response = await fetch(
      `${apiBaseUrl()}/api/v1/courses/${courseId}/case-studies${suffix}`,
      { headers: { authorization: `Bearer ${token}` }, cache: "no-store" },
    );
  } catch {
    return null;
  }
  if (!response.ok) return null;
  return (await response.json()) as Schemas["CaseStudyListOut"];
}

export async function listCaseStudies(
  token: string,
  courseId: number,
): Promise<Schemas["CaseStudySummary"][]> {
  const page = await listCaseStudyPage(token, courseId);
  return page?.items ?? [];
}

export async function listAllCaseStudies(
  token: string,
  courseId: number,
): Promise<Schemas["CaseStudySummary"][]> {
  const collected: Schemas["CaseStudySummary"][] = [];
  let cursor: number | undefined;
  for (let page = 0; page < LIST_PAGE_CAP; page += 1) {
    const result = await listCaseStudyPage(token, courseId, {
      limit: LIST_PAGE_LIMIT,
      ...(cursor !== undefined ? { cursor } : {}),
    });
    if (!result) return collected;
    // A cursor that does not move would append the same page forever. Stop
    // before that page is added a second time.
    if (
      cursor !== undefined &&
      result.next_cursor != null &&
      result.next_cursor <= cursor
    ) {
      return collected;
    }
    collected.push(...result.items);
    if (result.next_cursor == null) return collected;
    cursor = result.next_cursor;
  }
  return collected;
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
