// Opening a voice defence (Phase 7, decision 0045). Server-side only, like
// every authed call: the seat token is an httpOnly cookie the client cannot
// read (decision 0011).
//
// The socket is the exception this file has to make. A browser cannot set a
// header on a WebSocket handshake and Next's App Router cannot proxy an
// upgrade, so decision 0045 puts the seat token in the query string; `streamUrl`
// mints that URL here, on the server, and the surface holds it for the length of
// one conversation and no longer. Decision 0055 records what that costs.
import { apiBaseUrl, type Schemas } from "./client";

export type OpenFailure = "busy" | "unavailable";

export type OpenResult =
  | { ok: true; conversation: Schemas["ConversationOut"] }
  | { ok: false; reason: OpenFailure };

export async function openConversation(
  token: string,
  submissionId: number,
): Promise<OpenResult> {
  let response: Response;
  try {
    response = await fetch(
      `${apiBaseUrl()}/api/v1/submissions/${submissionId}/conversation`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      },
    );
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  // The surface only offers a defence on a processed submission, so the 409 that
  // reaches here in practice is the course's concurrency cap, which is honest
  // and has no queue behind it.
  if (response.status === 409) return { ok: false, reason: "busy" };
  if (!response.ok) return { ok: false, reason: "unavailable" };
  return { ok: true, conversation: (await response.json()) as Schemas["ConversationOut"] };
}

export function streamUrl(token: string, streamPath: string): string {
  const base = apiBaseUrl().replace(/^http/, "ws");
  return `${base}${streamPath}?token=${encodeURIComponent(token)}`;
}
