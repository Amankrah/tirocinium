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

// Read one import's current state (status, page_count once decoded, pages_done
// and the derived stage while the worker is running). A course the professor
// does not own, or an id from another course, is a 404 and collapses to null.
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

// The confirmation surface (milestone 4.4). All calls are professor-and-owner
// and nest under the course. The items read omits discarded and merged items,
// so the list is the source of truth after any verb: a caller refetches rather
// than reconciling state by hand.

export async function getImportItems(
  token: string,
  courseId: number,
  importId: number,
): Promise<Schemas["ImportItemsOut"] | null> {
  return readJson(token, `courses/${courseId}/imports/${importId}/items`);
}

// Confirm an item to a draft case study, carrying the professor's edits and the
// figure-intervention count (a 4.5 accuracy signal). Returns the draft id and the
// text edit distance, or null on any failure (including a 409 on an item already
// out of the list).
export async function confirmItem(
  token: string,
  courseId: number,
  itemId: number,
  body: Schemas["ConfirmIn"],
): Promise<Schemas["ConfirmedOut"] | null> {
  return mutateJson(token, `courses/${courseId}/import-items/${itemId}/confirm`, "POST", body);
}

// Discard an item (a state edit, kept for the purge and metrics). True on the
// 204, false otherwise; idempotent server-side, and a 409 (a confirmed item)
// just means the caller should refetch.
export async function discardItem(
  token: string,
  courseId: number,
  itemId: number,
): Promise<boolean> {
  return noContent(token, `courses/${courseId}/import-items/${itemId}/discard`, "POST");
}

// Merge a sibling into the survivor (the item in the path). Returns the
// survivor's combined text immediately; the caller still refetches for the moved
// figures. A 409 ("already merged") collapses to null, which the caller treats
// as "refetch", not an error.
export async function mergeItems(
  token: string,
  courseId: number,
  survivorId: number,
  sourceItemId: number,
): Promise<Schemas["MergedOut"] | null> {
  const body: Schemas["MergeIn"] = { source_item_id: sourceItemId };
  return mutateJson(token, `courses/${courseId}/import-items/${survivorId}/merge`, "POST", body);
}

// Draw-a-box: crop a new figure from a page region (bbox normalised 0..1) and
// attach it to the item. Returns the new figure so the surface can render it.
export async function addFigureFromBox(
  token: string,
  courseId: number,
  itemId: number,
  body: Schemas["AddBoxIn"],
): Promise<Schemas["FigureCreatedOut"] | null> {
  return mutateJson(
    token,
    `courses/${courseId}/import-items/${itemId}/figures/from-box`,
    "POST",
    body,
  );
}

// Set a figure's role on an item (essential keeps it in AI context, decorative
// excludes it). Also the "assign" half of a reassign (PUT on the new item, then
// removeFigure on the old).
export async function setFigureRole(
  token: string,
  courseId: number,
  itemId: number,
  figureId: number,
  role: "essential" | "decorative",
): Promise<boolean> {
  const body: Schemas["FigureRoleIn"] = { role };
  return noContent(
    token,
    `courses/${courseId}/import-items/${itemId}/figures/${figureId}`,
    "PUT",
    body,
  );
}

// Remove a figure from an item (unassigns the link; the content-addressed figure
// itself survives for other items).
export async function removeFigure(
  token: string,
  courseId: number,
  itemId: number,
  figureId: number,
): Promise<boolean> {
  return noContent(
    token,
    `courses/${courseId}/import-items/${itemId}/figures/${figureId}`,
    "DELETE",
  );
}

// ------------------------------------------------------------ small helpers

async function readJson<T>(token: string, path: string): Promise<T | null> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}/api/v1/${path}`, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  return (await response.json()) as T;
}

async function mutateJson<T>(
  token: string,
  path: string,
  method: string,
  body: unknown,
): Promise<T | null> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}/api/v1/${path}`, {
      method,
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
  return (await response.json()) as T;
}

async function noContent(
  token: string,
  path: string,
  method: string,
  body?: unknown,
): Promise<boolean> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}/api/v1/${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    return false;
  }
  return response.ok;
}
