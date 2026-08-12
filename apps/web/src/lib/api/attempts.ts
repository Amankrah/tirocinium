// The attempt span (milestone 9.6, decision 0058, backend): a server-stamped
// record of when a student started working on a variant, which the submission
// may cite so the (started, submitted) span of frontend guide 4.2 is an honest
// record rather than a client's word for it.
//
// There is deliberately no "stop" call and no client clock anywhere in this
// file: the server holds the stopwatch, because a span the client names is a
// span the client can invent, and this one is shown to a professor as evidence
// of engaged work. Server-side only, carrying the seat token (decision 0011).
import { apiBaseUrl, type Schemas } from "./client";

// Start an attempt. Starting twice is ordinary rather than an error (a student
// may open a problem, put it down, and come back), so this needs no idempotency
// key: each call is its own row and only the one a submission cites counts.
export async function startAttempt(
  token: string,
  variantId: number,
): Promise<Schemas["AttemptOut"] | null> {
  let response: Response;
  try {
    response = await fetch(
      `${apiBaseUrl()}/api/v1/variants/${variantId}/attempts`,
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
  return (await response.json()) as Schemas["AttemptOut"];
}
