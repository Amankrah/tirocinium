import { describe, expect, it } from "vitest";

import {
  INITIAL_PROCESSING,
  parseProcessingEvent,
  PROCESSING_TERMINAL,
  reduceProcessing,
  type ProcessingState,
} from "./processing";

// Feed a stream of raw SSE payloads through parse + reduce, as the driver does.
function run(payloads: string[]): ProcessingState {
  let state = INITIAL_PROCESSING;
  for (const p of payloads) {
    const event = parseProcessingEvent(p);
    if (event) state = reduceProcessing(state, event);
  }
  return state;
}

describe("parseProcessingEvent accepts the worker's contract", () => {
  it("parses each modelled event type", () => {
    expect(parseProcessingEvent('{"type":"status","status":"processing"}')).toEqual({
      type: "status",
      status: "processing",
    });
    expect(
      parseProcessingEvent('{"type":"page","page_index":1,"confidence":0.92}'),
    ).toEqual({ type: "page", page_index: 1, confidence: 0.92 });
    expect(
      parseProcessingEvent(
        '{"type":"rejected","page_index":0,"reason":"blurry","message":"is too blurry to read, please retake it"}',
      ),
    ).toEqual({
      type: "rejected",
      page_index: 0,
      reason: "blurry",
      message: "is too blurry to read, please retake it",
    });
    expect(parseProcessingEvent('{"type":"done","status":"processed"}')).toEqual({
      type: "done",
      status: "processed",
    });
  });

  it("returns null on malformed json, unknown types, and missing fields", () => {
    expect(parseProcessingEvent("not json")).toBeNull();
    expect(parseProcessingEvent('{"type":"heartbeat"}')).toBeNull();
    expect(parseProcessingEvent('{"type":"page","page_index":1}')).toBeNull();
    expect(parseProcessingEvent('"a string"')).toBeNull();
  });
});

describe("reduceProcessing folds a run to its outcome", () => {
  it("collects per-page confidence and reaches processed", () => {
    const state = run([
      '{"type":"status","status":"processing"}',
      '{"type":"page","page_index":0,"confidence":0.9}',
      '{"type":"page","page_index":1,"confidence":0.4}',
      '{"type":"done","status":"processed"}',
    ]);
    expect(state.status).toBe("processed");
    expect(state.done).toBe(true);
    expect(state.terminalStatus).toBe("processed");
    expect(state.pages).toEqual([
      { pageIndex: 0, confidence: 0.9 },
      { pageIndex: 1, confidence: 0.4 },
    ]);
  });

  it("carries a rejected page's retake message and ends needs_retake", () => {
    const state = run([
      '{"type":"status","status":"processing"}',
      '{"type":"rejected","page_index":2,"reason":"too_dark","message":"is too dark, please retake it in better light"}',
      '{"type":"done","status":"needs_retake"}',
    ]);
    expect(state.terminalStatus).toBe("needs_retake");
    expect(PROCESSING_TERMINAL.has(state.terminalStatus ?? "")).toBe(true);
    const page = state.pages.find((p) => p.pageIndex === 2);
    expect(page?.rejected?.reason).toBe("too_dark");
    expect(page?.rejected?.message).toContain("please retake it");
  });

  it("keeps pages ordered even if events arrive out of order", () => {
    const state = run([
      '{"type":"page","page_index":2,"confidence":0.5}',
      '{"type":"page","page_index":0,"confidence":0.8}',
    ]);
    expect(state.pages.map((p) => p.pageIndex)).toEqual([0, 2]);
  });

  it("ignores an unrecognised payload without disturbing state", () => {
    const state = run([
      '{"type":"status","status":"processing"}',
      "keep-alive",
      '{"type":"done","status":"failed"}',
    ]);
    expect(state.terminalStatus).toBe("failed");
  });
});
