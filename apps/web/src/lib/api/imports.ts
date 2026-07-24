// PDF import against the backend (backend guide section 5, milestone 4.1). A
// professor uploads a PDF straight to object storage via the presigned URL these
// calls return; the authed create/complete/get run server-side carrying the
// professor JWT (decision 0012), so the token never reaches client JavaScript.
// Imports nest under the course (decision 0013). All server shapes come from the
// generated client (frontend guide 7).
import { apiBaseUrl, type Schemas } from "./client";

// Create an import job and get the presigned PUT target for the PDF. Idempotent:
// a retry with the same key returns the original job. Returns null on any
// non-201 or transport failure.
export async function createImport(
  token: string,
  courseId: number,
  sizeBytes: number,
  idempotencyKey: string,
): Promise<Schemas["ImportCreated"] | null> {
  const body: Schemas["ImportIn"] = {
    content_type: "application/pdf",
    size_bytes: sizeBytes,
  };
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}/api/v1/courses/${courseId}/imports`, {
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
  return (await response.json()) as Schemas["ImportCreated"];
}

// Signal the PDF has reached storage: flips the job to uploaded and enqueues
// decode. Naturally idempotent server-side.
export async function completeImport(
  token: string,
  courseId: number,
  importId: number,
): Promise<Schemas["ImportOut"] | null> {
  let response: Response;
  try {
    response = await fetch(
      `${apiBaseUrl()}/api/v1/courses/${courseId}/imports/${importId}/complete`,
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
  return (await response.json()) as Schemas["ImportOut"];
}

// Read one import's current state (status, page_count once decoded). A course
// the professor does not own, or an id from another course, is a 404 and
// collapses to null.
export async function getImport(
  token: string,
  courseId: number,
  importId: number,
): Promise<Schemas["ImportOut"] | null> {
  let response: Response;
  try {
    response = await fetch(
      `${apiBaseUrl()}/api/v1/courses/${courseId}/imports/${importId}`,
      {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      },
    );
  } catch {
    return null;
  }
  if (!response.ok) return null;
  return (await response.json()) as Schemas["ImportOut"];
}
