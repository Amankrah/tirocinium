// Variant generation, listing, the verification diff read, and the review verbs
// (Phase 5.3/5.4). Professor-and-owner, carrying the JWT server-side (decision
// 0012); shapes from the generated client (frontend guide 7). Generation is
// pooled and background: there is no progress stream, so callers poll the list.
import { apiBaseUrl, type Schemas } from "./client";

const caseBase = (courseId: number, caseStudyId: number) =>
  `${apiBaseUrl()}/api/v1/courses/${courseId}/case-studies/${caseStudyId}`;
const variantBase = (courseId: number, variantId: number) =>
  `${apiBaseUrl()}/api/v1/courses/${courseId}/variants/${variantId}`;

// Enqueue seeded background generation (1 to 20). Idempotent on the key: a retry
// returns the same seeds, so a double submit cannot double spend. Null on any
// failure (409 when the case study has no spec yet).
export async function generateVariants(
  token: string,
  courseId: number,
  caseStudyId: number,
  count: number,
  idempotencyKey: string,
): Promise<Schemas["GenerateOut"] | null> {
  const body: Schemas["GenerateIn"] = { count };
  let response: Response;
  try {
    response = await fetch(`${caseBase(courseId, caseStudyId)}/variants`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "idempotency-key": idempotencyKey,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  return (await response.json()) as Schemas["GenerateOut"];
}

// List variants by state (verified | flagged | manual), cursor-paginated.
export async function listVariants(
  token: string,
  courseId: number,
  caseStudyId: number,
  options: { state?: string; cursor?: number; limit?: number } = {},
): Promise<Schemas["VariantListOut"] | null> {
  const query = new URLSearchParams();
  if (options.state) query.set("state", options.state);
  if (options.cursor != null) query.set("cursor", String(options.cursor));
  if (options.limit != null) query.set("limit", String(options.limit));
  const suffix = query.toString() ? `?${query.toString()}` : "";
  let response: Response;
  try {
    response = await fetch(`${caseBase(courseId, caseStudyId)}/variants${suffix}`, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  return (await response.json()) as Schemas["VariantListOut"];
}

// The diff read: the generation solution and the independent re-solve side by
// side, plus the body and the sampled values.
export async function getVariant(
  token: string,
  courseId: number,
  variantId: number,
): Promise<Schemas["VariantDetail"] | null> {
  let response: Response;
  try {
    response = await fetch(variantBase(courseId, variantId), {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  return (await response.json()) as Schemas["VariantDetail"];
}

// Promote a flagged variant: it becomes manual and serves like verified. Null on
// a 409 (not flagged), which the caller treats as "refetch".
export async function promoteVariant(
  token: string,
  courseId: number,
  variantId: number,
): Promise<Schemas["VariantSummary"] | null> {
  let response: Response;
  try {
    response = await fetch(`${variantBase(courseId, variantId)}/promote`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  return (await response.json()) as Schemas["VariantSummary"];
}

// Edit a variant's body or solution: an edit always lands on manual (the
// professor took responsibility).
export async function editVariant(
  token: string,
  courseId: number,
  variantId: number,
  edit: Schemas["VariantEdit"],
): Promise<Schemas["VariantSummary"] | null> {
  let response: Response;
  try {
    response = await fetch(variantBase(courseId, variantId), {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(edit),
      cache: "no-store",
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  return (await response.json()) as Schemas["VariantSummary"];
}

// Delete a variant. False on a 409 (submissions reference it).
export async function deleteVariant(
  token: string,
  courseId: number,
  variantId: number,
): Promise<boolean> {
  let response: Response;
  try {
    response = await fetch(variantBase(courseId, variantId), {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch {
    return false;
  }
  return response.ok;
}
