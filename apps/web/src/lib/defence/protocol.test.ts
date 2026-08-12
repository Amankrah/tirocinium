import { describe, expect, it } from "vitest";

import { clientFrame, parseServerMessage } from "./protocol";

// The wire contract with the defence stream (the backend handoff). Parsing must
// be total: a frame the client does not understand is ignored, never thrown on,
// because a socket that grows a message must not take the conversation down.
describe("parseServerMessage", () => {
  it("reads every message the stream sends", () => {
    expect(parseServerMessage('{"type":"ready"}')).toEqual({ type: "ready" });
    expect(parseServerMessage('{"type":"partial","text":"so the rate"}')).toEqual({
      type: "partial",
      text: "so the rate",
    });
    expect(parseServerMessage('{"type":"turn","text":"So the rate is fixed."}')).toEqual(
      { type: "turn", text: "So the rate is fixed." },
    );
    expect(parseServerMessage('{"type":"reply_text","text":"Why "}')).toEqual({
      type: "reply_text",
      text: "Why ",
    });
    expect(parseServerMessage('{"type":"reply_done","first_audio_ms":412}')).toEqual({
      type: "reply_done",
      firstAudioMs: 412,
    });
    expect(parseServerMessage('{"type":"interrupted"}')).toEqual({
      type: "interrupted",
    });
    expect(parseServerMessage('{"type":"wind_down"}')).toEqual({ type: "wind_down" });
    expect(parseServerMessage('{"type":"speech_down"}')).toEqual({
      type: "speech_down",
    });
    expect(parseServerMessage('{"type":"audio_down"}')).toEqual({ type: "audio_down" });
    expect(parseServerMessage('{"type":"closed"}')).toEqual({ type: "closed" });
    expect(parseServerMessage('{"type":"verdict","concept_to_revisit":7}')).toEqual({
      type: "verdict",
      conceptToRevisit: 7,
    });
  });

  it("carries a null concept on a verdict that names none", () => {
    expect(parseServerMessage('{"type":"verdict","concept_to_revisit":null}')).toEqual({
      type: "verdict",
      conceptToRevisit: null,
    });
  });

  it("reads a missing text field as empty, since the server omits it when it is", () => {
    expect(parseServerMessage('{"type":"reply_text"}')).toEqual({
      type: "reply_text",
      text: "",
    });
  });

  it("reads a reply_done without a measurement as null rather than zero", () => {
    expect(parseServerMessage('{"type":"reply_done"}')).toEqual({
      type: "reply_done",
      firstAudioMs: null,
    });
  });

  it("ignores malformed, non-object, and unknown frames", () => {
    expect(parseServerMessage("not json")).toBeNull();
    expect(parseServerMessage('"a string"')).toBeNull();
    expect(parseServerMessage("null")).toBeNull();
    expect(parseServerMessage('{"text":"no type"}')).toBeNull();
    expect(parseServerMessage('{"type":"something_new"}')).toBeNull();
  });
});

describe("clientFrame", () => {
  it("builds the three control frames the server accepts", () => {
    expect(JSON.parse(clientFrame.text("I used the average."))).toEqual({
      type: "text",
      text: "I used the average.",
    });
    expect(JSON.parse(clientFrame.endTurn())).toEqual({ type: "end_turn" });
    expect(JSON.parse(clientFrame.end())).toEqual({ type: "end" });
  });
});
