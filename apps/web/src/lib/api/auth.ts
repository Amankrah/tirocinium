// Professor authentication against the backend (backend guide 7.1). Server-side
// only: the mutation from a server action, the read from a Server Component,
// both carrying the JWT that lives in an httpOnly cookie and never reaches
// client JavaScript (decision 0012). All server shapes come from the generated
// client (frontend guide 7).
import { apiBaseUrl, type Schemas } from "./client";

export type LoginResult =
  | { ok: true; auth: Schemas["AuthOut"] }
  | { ok: false };

// Login failure is the backend's one generic outcome (401, unknown email and
// wrong password indistinguishable in body and timing); a backend outage is
// the same to the professor. Only a 200 carries a session forward.
export async function professorLogin(
  email: string,
  password: string,
): Promise<LoginResult> {
  const body: Schemas["LoginIn"] = { email, password };
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}/api/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    return { ok: false };
  }
  if (!response.ok) return { ok: false };
  const auth = (await response.json()) as Schemas["AuthOut"];
  return { ok: true, auth };
}

// Resolves the signed-in identity from its JWT. Returns null on any
// non-success or a non-professor role, which the caller treats as "send them
// back to sign-in".
export async function fetchProfessor(
  token: string,
): Promise<Schemas["Identity"] | null> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}/api/v1/auth/me`, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  const identity = (await response.json()) as Schemas["Identity"];
  if (identity.role !== "professor" && identity.role !== "admin") return null;
  return identity;
}
