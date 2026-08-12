import { describe, expect, it } from "vitest";

import { initialState, reduce, type SessionEvent, type SessionState } from "./session";

// Drive a sequence through the reducer, as the socket does.
function run(...events: SessionEvent[]): SessionState {
  return events.reduce(reduce, initialState());
}

describe("the defence session state", () => {
  it("starts connecting and opens on ready", () => {
    expect(initialState().phase).toBe("connecting");
    expect(run({ type: "ready" }).phase).toBe("listening");
  });

  it("shows a partial while the student speaks and drops it when the turn commits", () => {
    const speaking = run(
      { type: "ready" },
      { type: "partial", text: "so I took the" },
      { type: "partial", text: "so I took the average" },
    );
    expect(speaking.partial).toBe("so I took the average");
    expect(speaking.turns).toHaveLength(0);

    const committed = reduce(speaking, {
      type: "turn",
      text: "So I took the average.",
    });
    expect(committed.partial).toBe("");
    expect(committed.turns).toEqual([
      {
        id: 1,
        speaker: "student",
        text: "So I took the average.",
        interrupted: false,
        open: false,
      },
    ]);
    expect(committed.phase).toBe("thinking");
  });

  it("concatenates reply chunks into one tutor turn and closes it on reply_done", () => {
    const state = run(
      { type: "ready" },
      { type: "turn", text: "I averaged them." },
      { type: "reply_text", text: "Why " },
      { type: "reply_text", text: "the average " },
      { type: "reply_text", text: "and not the median?" },
    );
    expect(state.phase).toBe("speaking");
    expect(state.turns[1]).toMatchObject({
      speaker: "tutor",
      text: "Why the average and not the median?",
      open: true,
    });

    const done = reduce(state, { type: "reply_done", firstAudioMs: 412 });
    expect(done.phase).toBe("listening");
    expect(done.firstAudioMs).toBe(412);
    expect(done.turns[1]).toMatchObject({ open: false, interrupted: false });
  });

  it("keeps the fragment the student already heard when a reply is interrupted", () => {
    const state = run(
      { type: "ready" },
      { type: "turn", text: "I averaged them." },
      { type: "reply_text", text: "Why the average" },
      { type: "interrupted" },
    );
    // It was said, so it stays, marked rather than deleted.
    expect(state.turns[1]).toMatchObject({
      speaker: "tutor",
      text: "Why the average",
      interrupted: true,
      open: false,
    });
    expect(state.phase).toBe("listening");
  });

  it("starts a fresh tutor turn after an interruption rather than extending the old one", () => {
    const state = run(
      { type: "ready" },
      { type: "turn", text: "First." },
      { type: "reply_text", text: "Why the" },
      { type: "interrupted" },
      { type: "turn", text: "Because the rate is fixed." },
      { type: "reply_text", text: "Is it though?" },
    );
    expect(state.turns.map((t) => t.text)).toEqual([
      "First.",
      "Why the",
      "Because the rate is fixed.",
      "Is it though?",
    ]);
    expect(state.turns.map((t) => t.id)).toEqual([1, 2, 3, 4]);
  });

  it("goes typed-only when recognition dies, and stops painting a listening state", () => {
    const state = run(
      { type: "ready" },
      { type: "partial", text: "half a sentence" },
      { type: "speech_down" },
    );
    expect(state.speechDown).toBe(true);
    expect(state.partial).toBe("");
    // A dead recognizer must not keep showing interim text.
    expect(reduce(state, { type: "partial", text: "ghost" }).partial).toBe("");
    // The session continues; it does not close.
    expect(state.phase).not.toBe("closed");
  });

  it("treats an unavailable microphone as the same state as a dead recognizer", () => {
    const refused = run({ type: "ready" }, { type: "mic_unavailable" });
    const died = run({ type: "ready" }, { type: "speech_down" });
    expect(refused.speechDown).toBe(true);
    expect({ ...refused }).toEqual({ ...died });
  });

  it("keeps the conversation going on captions when synthesis dies", () => {
    const state = run(
      { type: "ready" },
      { type: "turn", text: "I averaged them." },
      { type: "audio_down" },
      { type: "reply_text", text: "Why the average?" },
      { type: "reply_done", firstAudioMs: null },
    );
    expect(state.audioDown).toBe(true);
    expect(state.phase).toBe("listening");
    // The reply is still a turn, which is what the next turn is reasoned from.
    expect(state.turns[1]?.text).toBe("Why the average?");
  });

  it("carries the wind-down as a quiet flag, not an end", () => {
    const state = run({ type: "ready" }, { type: "wind_down" });
    expect(state.windDown).toBe(true);
    expect(state.phase).toBe("listening");
  });

  it("closes, then accepts the trailing verdict and nothing else", () => {
    const closed = run(
      { type: "ready" },
      { type: "turn", text: "Done." },
      { type: "reply_text", text: "Good." },
      { type: "closed" },
    );
    expect(closed.phase).toBe("closed");
    expect(closed.turns[1]).toMatchObject({ open: false });
    // Late frames after close change nothing.
    expect(reduce(closed, { type: "reply_text", text: "late" })).toEqual(closed);

    const judged = reduce(closed, { type: "verdict", conceptToRevisit: 7 });
    expect(judged.verdict).toEqual({ conceptToRevisit: 7 });
    expect(judged.phase).toBe("closed");
  });

  it("distinguishes a lost socket from a session that ended", () => {
    const lost = run({ type: "ready" }, { type: "socket_lost" });
    expect(lost.phase).toBe("closed");
    expect(lost.lost).toBe(true);
    expect(run({ type: "ready" }, { type: "closed" }).lost).toBe(false);
  });
});
