// The submission upload path against the backend (backend guide section 4
// Stage 1, milestone 3.1). These run server-side only, carrying the seat's
// opaque token (httpOnly cookie, decision 0011) as a bearer credential: the
// browser uploads page bytes straight to object storage via the presigned URLs
// these calls return, but the authed create/complete/get never expose the
// token to client JavaScript. All server shapes come from the generated client
// (frontend guide 7).
//
// A submission is filed against a variant_id. Exposing a variant to practise
// against is a Phase 5 concern (the variant pool), so today a variant_id comes
// from a seed; this client is the stable seam that wiring plugs into then.
import { apiBaseUrl, type Schemas } from "./client";

// Create a submission for a variant: records the page manifest and returns the
// presigned PUT targets, one per page, in page order. The idempotency key makes
// the create safe to retry (a repeat returns the original submission, never a
// duplicate). Returns null on any non-201 or transport failure.
export async function createSubmission(
  token: string,
  variantId: number,
  pages: Schemas["PageIn"][],
  idempotencyKey: string,
): Promise<Schemas["SubmissionCreated"] | null> {
  const body: Schemas["SubmissionIn"] = { pages };
  let response: Response;
  try {
    response = await fetch(
      `${apiBaseUrl()}/api/v1/variants/${variantId}/submissions`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify(body),
        cache: "no-store",
      },
    );
  } catch {
    return null;
  }
  if (!response.ok) return null;
  return (await response.json()) as Schemas["SubmissionCreated"];
}

// Signal that every page has reached storage: flips the submission from pending
// to uploaded and enqueues preprocessing and transcription. Naturally
// idempotent server-side, so a retry is safe. Returns null on any failure.
export async function completeSubmission(
  token: string,
  submissionId: number,
): Promise<Schemas["SubmissionOut"] | null> {
  let response: Response;
  try {
    response = await fetch(
      `${apiBaseUrl()}/api/v1/submissions/${submissionId}/complete`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      },
    );
  } catch {
    return null;
  }
  if (!response.ok) return null;
  return (await response.json()) as Schemas["SubmissionOut"];
}

// Read one submission's current state (status, page manifest, recognition
// confidence once transcribed). A seat sees only its own; another's is a 404,
// which collapses to null here.
export async function getSubmission(
  token: string,
  submissionId: number,
): Promise<Schemas["SubmissionOut"] | null> {
  let response: Response;
  try {
    response = await fetch(
      `${apiBaseUrl()}/api/v1/submissions/${submissionId}`,
      {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      },
    );
  } catch {
    return null;
  }
  if (!response.ok) return null;
  return (await response.json()) as Schemas["SubmissionOut"];
}
