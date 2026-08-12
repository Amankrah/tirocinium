"use server";

// Opening the defence, server-side so the seat token stays out of the page's
// own JavaScript for as long as it can. The one thing this returns that the
// client must hold is the stream URL, which carries the token because decision
// 0045 authenticates the socket that way and a browser cannot set a header on a
// WebSocket handshake; decision 0055 records what that costs and what would fix
// it. Nothing here is stored or logged: the URL lives in the session module's
// memory for one conversation.
import { cookies } from "next/headers";

import { openConversation, type OpenFailure, streamUrl } from "@/lib/api/defence";
import { SEAT_COOKIE } from "@/lib/api/session";

export type OpenDefenceResult =
  | { ok: true; streamUrl: string }
  | { ok: false; reason: OpenFailure };

export async function openDefenceAction(
  submissionId: number,
): Promise<OpenDefenceResult> {
  const token = (await cookies()).get(SEAT_COOKIE)?.value;
  if (!token) return { ok: false, reason: "unavailable" };

  const result = await openConversation(token, submissionId);
  if (!result.ok) return result;

  return {
    ok: true,
    streamUrl: streamUrl(token, result.conversation.stream_path),
  };
}
