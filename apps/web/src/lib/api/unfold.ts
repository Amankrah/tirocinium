// The understanding unfold and the personal history (milestone 8.4, decision
// 0049). Seat surfaces, so these carry the seat's opaque token server-side
// (decision 0011); shapes from the generated client.
//
// The solution is earned, not browsed: the read opens once the seat has
// submitted for that variant or deliberately given up, and a first reveal
// without a submission is what records giving up. `through_step` is absolute, so
// a retried reveal never rewinds what has already been read.
import { apiBaseUrl, type Schemas } from "./client";

const solutionBase = (courseId: number, variantId: number) =>
  `${apiBaseUrl()}/api/v1/courses/${courseId}/variants/${variantId}/solution`;

// A 403 here is not an error to hide: it means the seat has neither submitted
// nor given up, which the surface answers with the two ways in.
export type UnfoldResult =
  | { ok: true; unfold: Schemas["UnfoldOut"] }
  | { ok: false; reason: "not_earned" | "unavailable" };

export async function getUnfold(
  token: string,
  courseId: number,
  variantId: number,
): Promise<UnfoldResult> {
  let response: Response;
  try {
    response = await fetch(solutionBase(courseId, variantId), {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  if (response.status === 403) return { ok: false, reason: "not_earned" };
  if (!response.ok) return { ok: false, reason: "unavailable" };
  return { ok: true, unfold: (await response.json()) as Schemas["UnfoldOut"] };
}

// Reveal through an absolute step number. Asking for a step already read is a
// no-op server-side, and asking past the end clamps, so the caller never has to
// track how far it got.
export async function revealThrough(
  token: string,
  courseId: number,
  variantId: number,
  throughStep: number,
): Promise<Schemas["UnfoldOut"] | null> {
  const body: Schemas["RevealIn"] = { through_step: throughStep };
  let response: Response;
  try {
    response = await fetch(`${solutionBase(courseId, variantId)}/reveal`, {
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
  return (await response.json()) as Schemas["UnfoldOut"];
}

// The seat's own record, newest first. Seat-only, like the mastery picture: a
// professor reads the class through the reporting surfaces, never through a
// student's own view.
export async function getHistory(
  token: string,
  courseId: number,
  options: { cursor?: number; limit?: number } = {},
): Promise<Schemas["HistoryOut"] | null> {
  const query = new URLSearchParams();
  if (options.cursor != null) query.set("cursor", String(options.cursor));
  if (options.limit != null) query.set("limit", String(options.limit));
  const suffix = query.toString() ? `?${query.toString()}` : "";
  let response: Response;
  try {
    response = await fetch(
      `${apiBaseUrl()}/api/v1/courses/${courseId}/history${suffix}`,
      { headers: { authorization: `Bearer ${token}` }, cache: "no-store" },
    );
  } catch {
    return null;
  }
  if (!response.ok) return null;
  return (await response.json()) as Schemas["HistoryOut"];
}
