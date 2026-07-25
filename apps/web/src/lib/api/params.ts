// The parameter spec and auto-parameterization against the backend (Phase 5,
// milestones 5.1 and 5.2). Professor-and-owner, nested under the case study.
// These run server-side carrying the professor JWT (decision 0012); shapes come
// from the generated client (frontend guide 7).
import { apiBaseUrl, type Schemas } from "./client";

const base = (courseId: number, caseStudyId: number) =>
  `${apiBaseUrl()}/api/v1/courses/${courseId}/case-studies/${caseStudyId}`;

// The saved spec, or null when none is saved (the panel's empty state, a 404 the
// backend returns by design, not an error).
export async function getParamSpec(
  token: string,
  courseId: number,
  caseStudyId: number,
): Promise<Schemas["ParamSpec"] | null> {
  let response: Response;
  try {
    response = await fetch(`${base(courseId, caseStudyId)}/param-spec`, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  return (await response.json()) as Schemas["ParamSpec"];
}

// Saving runs the frozen check: a value printed inside an essential figure comes
// back as a 409 with the blocked parameters and their reasons, and nothing is
// stored. The result discriminates the three outcomes the panel must show.
export type SaveSpecResult =
  | { ok: Schemas["ParamSpec"] }
  | { blocked: Schemas["BlockedParameter"][] }
  | { error: true };

export async function saveParamSpec(
  token: string,
  courseId: number,
  caseStudyId: number,
  spec: Schemas["ParamSpec"],
): Promise<SaveSpecResult> {
  let response: Response;
  try {
    response = await fetch(`${base(courseId, caseStudyId)}/param-spec`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(spec),
      cache: "no-store",
    });
  } catch {
    return { error: true };
  }
  if (response.status === 409) {
    const problem = (await response.json()) as Schemas["ParamSpecBlockedProblem"];
    return { blocked: problem.blocked ?? [] };
  }
  if (!response.ok) return { error: true };
  return { ok: (await response.json()) as Schemas["ParamSpec"] };
}

export async function deleteParamSpec(
  token: string,
  courseId: number,
  caseStudyId: number,
): Promise<boolean> {
  let response: Response;
  try {
    response = await fetch(`${base(courseId, caseStudyId)}/param-spec`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch {
    return false;
  }
  return response.ok;
}

// Auto-parameterize: one model call returning a complete draft spec with
// rationales, verified literal positions, and the frozen locks. Idempotent on
// the key. Null on any failure (the overlay shows a retry).
export async function autoParameterize(
  token: string,
  courseId: number,
  caseStudyId: number,
  idempotencyKey: string,
): Promise<Schemas["ProposalOut"] | null> {
  let response: Response;
  try {
    response = await fetch(`${base(courseId, caseStudyId)}/auto-parameterize`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "idempotency-key": idempotencyKey,
      },
      cache: "no-store",
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  return (await response.json()) as Schemas["ProposalOut"];
}
