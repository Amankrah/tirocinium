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
