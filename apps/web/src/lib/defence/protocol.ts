// The defence stream's wire protocol (Phase 7, the backend handoff in
// docs/handoffs/defence-stream-protocol.md). Text frames are JSON control
// messages in both directions; binary frames are raw PCM audio and never come
// through here. Parsing is pure and total: an unknown type or a malformed frame
// yields null rather than throwing, because a socket that grows a message the
// client does not know must not take the conversation down with it.

export type ServerMessage =
  | { type: "ready" }
  | { type: "partial"; text: string }
  | { type: "turn"; text: string }
  | { type: "reply_text"; text: string }
  | { type: "reply_done"; firstAudioMs: number | null }
  | { type: "interrupted" }
  | { type: "wind_down" }
  | { type: "speech_down" }
  | { type: "audio_down" }
  | { type: "closed" }
  | { type: "verdict"; conceptToRevisit: number | null };

// The server omits `text` when it is empty, so a text-carrying message with no
// text is read as the empty string rather than rejected.
function textOf(payload: Record<string, unknown>): string {
  const value = payload["text"];
  return typeof value === "string" ? value : "";
}

export function parseServerMessage(raw: string): ServerMessage | null {
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof payload !== "object" || payload === null) return null;
  const record = payload as Record<string, unknown>;
  const type = record["type"];
  if (typeof type !== "string") return null;

  switch (type) {
    case "ready":
    case "interrupted":
    case "wind_down":
    case "speech_down":
    case "audio_down":
    case "closed":
      return { type };
    case "partial":
    case "turn":
    case "reply_text":
      return { type, text: textOf(record) };
    case "reply_done": {
      const ms = record["first_audio_ms"];
      return { type, firstAudioMs: typeof ms === "number" ? ms : null };
    }
    case "verdict": {
      const concept = record["concept_to_revisit"];
      return {
        type,
        conceptToRevisit: typeof concept === "number" ? concept : null,
      };
    }
    default:
      return null;
  }
}

// Client to server. A typed turn is a complete turn on its own (the fallback),
// `end_turn` forces an endpoint for push-to-talk, and `end` closes the session
// and triggers the verdict.
export const clientFrame = {
  text: (text: string): string => JSON.stringify({ type: "text", text }),
  endTurn: (): string => JSON.stringify({ type: "end_turn" }),
  end: (): string => JSON.stringify({ type: "end" }),
} as const;
