// The processing-state model for the upload flow (frontend guide 4.1, step 4).
// After a submission completes, the worker streams progress; these events are
// the contract emitted by app/transcription/pipeline.py over the submission's
// channel. Parsing and reduction are pure so they are unit-tested; the
// EventSource wiring that feeds them lives in subscribe-processing.ts.

// Terminal statuses the worker drives a submission to (pipeline.TERMINAL_STATUSES).
export const PROCESSING_TERMINAL = new Set(["processed", "needs_retake", "failed"]);

export type ProcessingEvent =
  | { type: "status"; status: string }
  | { type: "page"; page_index: number; confidence: number }
  | { type: "rejected"; page_index: number; reason: string; message: string }
  | { type: "done"; status: string };

export interface PageOutcome {
  pageIndex: number;
  confidence?: number;
  // Set when preprocessing refused the page; message reads after a "Page N"
  // prefix (the backend words it that way, decision 0016).
  rejected?: { reason: string; message: string };
}

export interface ProcessingState {
  status: string;
  pages: PageOutcome[];
  done: boolean;
  terminalStatus: string | null;
  // The live stream dropped (as opposed to the work failing); set by the driver.
  error: boolean;
}

export const INITIAL_PROCESSING: ProcessingState = {
  status: "uploaded",
  pages: [],
  done: false,
  terminalStatus: null,
  error: false,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// Parse one SSE payload into a typed event, or null if it is not one we model
// (so a stray keep-alive or a shape we do not recognise is simply ignored).
export function parseProcessingEvent(data: string): ProcessingEvent | null {
  let raw: unknown;
  try {
    raw = JSON.parse(data);
  } catch {
    return null;
  }
  if (!isRecord(raw)) return null;
  const { type } = raw;
  if (type === "status" && typeof raw.status === "string") {
    return { type, status: raw.status };
  }
  if (
    type === "page" &&
    typeof raw.page_index === "number" &&
    typeof raw.confidence === "number"
  ) {
    return { type, page_index: raw.page_index, confidence: raw.confidence };
  }
  if (
    type === "rejected" &&
    typeof raw.page_index === "number" &&
    typeof raw.reason === "string" &&
    typeof raw.message === "string"
  ) {
    return {
      type,
      page_index: raw.page_index,
      reason: raw.reason,
      message: raw.message,
    };
  }
  if (type === "done" && typeof raw.status === "string") {
    return { type, status: raw.status };
  }
  return null;
}

function upsertPage(
  pages: PageOutcome[],
  pageIndex: number,
  patch: Partial<PageOutcome>,
): PageOutcome[] {
  const existing = pages.find((p) => p.pageIndex === pageIndex);
  if (existing) {
    return pages.map((p) => (p.pageIndex === pageIndex ? { ...p, ...patch } : p));
  }
  return [...pages, { pageIndex, ...patch }].sort(
    (a, b) => a.pageIndex - b.pageIndex,
  );
}

export function reduceProcessing(
  state: ProcessingState,
  event: ProcessingEvent,
): ProcessingState {
  switch (event.type) {
    case "status":
      return { ...state, status: event.status };
    case "page":
      return {
        ...state,
        pages: upsertPage(state.pages, event.page_index, {
          confidence: event.confidence,
        }),
      };
    case "rejected":
      return {
        ...state,
        pages: upsertPage(state.pages, event.page_index, {
          rejected: { reason: event.reason, message: event.message },
        }),
      };
    case "done":
      return {
        ...state,
        status: event.status,
        done: true,
        terminalStatus: event.status,
      };
  }
}
