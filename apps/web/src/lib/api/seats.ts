// Seat redemption and identity against the backend (backend guide 7.1). These
// run server-side only: the mutation from a server action, the read from a
// Server Component, both carrying the opaque seat token that lives in an
// httpOnly cookie and never reaches client JavaScript (decision 0011). All
// server shapes come from the generated client (frontend guide 7).
import { apiBaseUrl, type Schemas } from "./client";

export type RedeemResult =
  | { ok: true; session: Schemas["RedeemOut"] }
  | { ok: false };

// Every failure the backend can return here (wrong, revoked, unknown, or
// malformed code as 401; rate limited as 429) is the one honest failure to the
// student, and so is a backend outage: one line, no diagnosis (guide 4.0).
export async function redeemSeatCode(code: string): Promise<RedeemResult> {
  const body: Schemas["RedeemIn"] = { code };
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}/api/v1/seats/redeem`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    return { ok: false };
  }
  if (!response.ok) return { ok: false };
  const session = (await response.json()) as Schemas["RedeemOut"];
  return { ok: true, session };
}

// Resolves the seat's own identity from its token. Returns null on any
// non-success (an unknown or revoked session is indistinguishable, by rule),
// which the caller treats as "send them back to /enter".
export async function fetchSeatMe(
  token: string,
): Promise<Schemas["SeatMeOut"] | null> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}/api/v1/seats/me`, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  return (await response.json()) as Schemas["SeatMeOut"];
}

// Seat management for the professor course surface (the other side of backend
// 7.1). Server-side only, carrying the professor JWT; the backend enforces
// course ownership, so a professor only ever touches their own seats.
//
// Plaintext seat codes appear in exactly one response ever: the generation
// artifacts (the CSV and PDF behind short-lived URLs) or a reissue body. These
// wrappers pass those through untouched and never log them.
export async function listSeats(
  token: string,
  courseId: number,
): Promise<Schemas["SeatOut"][]> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}/api/v1/courses/${courseId}/seats`, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch {
    return [];
  }
  if (!response.ok) return [];
  const data = (await response.json()) as Schemas["SeatListOut"];
  return data.seats;
}

export async function generateSeatBatch(
  token: string,
  courseId: number,
  count: number,
): Promise<Schemas["SeatBatchOut"] | null> {
  const body: Schemas["SeatBatchIn"] = { count };
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}/api/v1/courses/${courseId}/seats`, {
      method: "POST",
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
  return (await response.json()) as Schemas["SeatBatchOut"];
}

export async function revokeSeat(
  token: string,
  seatId: number,
): Promise<Schemas["RevokeOut"] | null> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}/api/v1/seats/${seatId}/revoke`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  return (await response.json()) as Schemas["RevokeOut"];
}

export async function reissueSeat(
  token: string,
  seatId: number,
): Promise<Schemas["ReissueOut"] | null> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}/api/v1/seats/${seatId}/reissue`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  return (await response.json()) as Schemas["ReissueOut"];
}
