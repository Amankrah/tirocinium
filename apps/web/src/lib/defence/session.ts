// The defence session's state, as a pure reducer over the stream's messages
// (milestone 7.4, decision 0055). Every rule the surface must honour lives here
// rather than in the React layer, so barge-in, degradation, and turn commitment
// are tested without a browser or a socket.
//
// Two rules from the backend handoff shape this. A committed `turn` is what
// enters the transcript, never the last `partial`, so a partial is display-only
// and is dropped the moment a turn lands. And a reply cancelled by barge-in
// keeps the fragment the student already heard, because it was said: dropping
// it would show a transcript of a conversation that did not happen.
import type { ServerMessage } from "./protocol";

export type Phase = "connecting" | "listening" | "thinking" | "speaking" | "closed";

export interface Turn {
  id: number;
  speaker: "student" | "tutor";
  text: string;
  // A tutor turn cut short by barge-in. The text stays; the mark is honest.
  interrupted: boolean;
  // Still streaming. An open turn is extended by the next reply chunk.
  open: boolean;
}

export interface SessionState {
  phase: Phase;
  turns: Turn[];
  // Interim recognition of what the student is saying now. Display only.
  partial: string;
  // Recognition is gone (dead stream, or a microphone we were never given).
  // The keyboard is the conversation from here; the session continues.
  speechDown: boolean;
  // Synthesis is gone. Captions are the conversation; the session continues.
  audioDown: boolean;
  windDown: boolean;
  verdict: { conceptToRevisit: number | null } | null;
  // The last turn's measured first-audio latency, kept for the surface to use
  // if it ever wants it and for tests to assert the field is carried.
  firstAudioMs: number | null;
  // The socket died before the loop closed, which is not the same as a session
  // that ended, and the copy says so.
  lost: boolean;
}

// Local events the surface raises that no server sends. A refused or absent
// microphone lands in exactly the same state as a dead recognizer, because the
// student needs the identical thing from both: the keyboard.
export type SessionEvent =
  | ServerMessage
  | { type: "mic_unavailable" }
  | { type: "socket_lost" };

export function initialState(): SessionState {
  return {
    phase: "connecting",
    turns: [],
    partial: "",
    speechDown: false,
    audioDown: false,
    windDown: false,
    verdict: null,
    firstAudioMs: null,
    lost: false,
  };
}

function closeOpenTurn(turns: Turn[], interrupted: boolean): Turn[] {
  const last = turns[turns.length - 1];
  if (!last || !last.open) return turns;
  return [
    ...turns.slice(0, -1),
    { ...last, open: false, interrupted: last.interrupted || interrupted },
  ];
}

function append(turns: Turn[], turn: Omit<Turn, "id">): Turn[] {
  const id = (turns[turns.length - 1]?.id ?? 0) + 1;
  return [...turns, { ...turn, id }];
}

export function reduce(state: SessionState, event: SessionEvent): SessionState {
  // Nothing reopens a closed session except its own trailing verdict, which is
  // the last message the server sends.
  if (state.phase === "closed" && event.type !== "verdict") {
    return state;
  }

  switch (event.type) {
    case "ready":
      return { ...state, phase: "listening" };

    case "partial":
      // A recognizer we have given up on must not paint a listening state.
      if (state.speechDown) return state;
      return { ...state, partial: event.text };

    case "turn":
      return {
        ...state,
        phase: "thinking",
        partial: "",
        turns: append(closeOpenTurn(state.turns, false), {
          speaker: "student",
          text: event.text,
          interrupted: false,
          open: false,
        }),
      };

    case "reply_text": {
      const last = state.turns[state.turns.length - 1];
      const turns =
        last && last.open && last.speaker === "tutor"
          ? [...state.turns.slice(0, -1), { ...last, text: last.text + event.text }]
          : append(state.turns, {
              speaker: "tutor",
              text: event.text,
              interrupted: false,
              open: true,
            });
      return { ...state, phase: "speaking", turns };
    }

    case "reply_done":
      return {
        ...state,
        phase: "listening",
        firstAudioMs: event.firstAudioMs,
        turns: closeOpenTurn(state.turns, false),
      };

    case "interrupted":
      // The fragment already spoken stays in the transcript, marked.
      return {
        ...state,
        phase: "listening",
        turns: closeOpenTurn(state.turns, true),
      };

    case "wind_down":
      return { ...state, windDown: true };

    case "speech_down":
    case "mic_unavailable":
      return { ...state, speechDown: true, partial: "" };

    case "audio_down":
      return { ...state, audioDown: true };

    case "closed":
      return {
        ...state,
        phase: "closed",
        partial: "",
        turns: closeOpenTurn(state.turns, false),
      };

    case "socket_lost":
      return {
        ...state,
        phase: "closed",
        partial: "",
        lost: true,
        turns: closeOpenTurn(state.turns, false),
      };

    case "verdict":
      return { ...state, verdict: { conceptToRevisit: event.conceptToRevisit } };

    default:
      return state;
  }
}
