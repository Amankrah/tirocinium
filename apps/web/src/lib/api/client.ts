// The thin fetch wrapper over the generated OpenAPI types (frontend guide 2:
// "openapi-typescript plus a thin fetch wrapper"). Everything here runs
// server-side only: it carries the seat token and the backend origin, neither
// of which belongs in client JavaScript, so content route bundles stay
// untouched by it.
import type { components } from "./schema";

// Server data shapes come only from the generated client, never hand-written
// (frontend guide 7); this alias is the one place features reach them.
export type Schemas = components["schemas"];

// The backend origin, read from a server-only env var (no NEXT_PUBLIC_): the
// browser never calls the API directly, so the base URL never ships to it.
export function apiBaseUrl(): string {
  return process.env.API_BASE_URL ?? "http://localhost:8000";
}

// Most modules here collapse a failure to null, because their callers have one
// thing to say either way. The marketplace modules cannot: a 409 on the front
// door means the course does not price materials, a 409 on a basket means the
// quotation is already issued, and an interface told only "no" would have to
// guess between them. So these carry the status and the backend's own problem
// detail, which guide 3.4 asks errors to do.
export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; detail: string };

// A network that never answered has no status of its own, so it gets zero and
// the caller supplies the copy.
export const OFFLINE = 0;

export async function apiCall<T>(
  token: string,
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<Result<T>> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}/api/v1${path}`, {
      method: init?.method ?? "GET",
      headers: {
        authorization: `Bearer ${token}`,
        ...(init?.body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
    });
  } catch {
    return { ok: false, status: OFFLINE, detail: "" };
  }
  if (!response.ok) {
    // The backend speaks problem details, so the honest line is usually already
    // written for us; an unreadable body falls back to the empty string and the
    // caller's own copy.
    let detail = "";
    try {
      const body = (await response.json()) as { detail?: unknown };
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      detail = "";
    }
    return { ok: false, status: response.status, detail };
  }
  if (response.status === 204) return { ok: true, data: undefined as T };
  return { ok: true, data: (await response.json()) as T };
}
