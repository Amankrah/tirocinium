// Honest per-stage status for the import processing view (frontend guide 4.3).
// The server names the live stage; figure extraction shares the page loop with
// reading, so those two lines are current together rather than faked as a
// later wait.
import type { ImportPhase } from "./import-controller";

export type ServerImportStage = "opening" | "reading" | "segmenting";

export type ImportWorkStep = "uploading" | "reading" | "figures" | "segmenting";

export type StepStatus = "done" | "current" | "upcoming";

export function stepStatuses(
  phase: ImportPhase,
  stage: ServerImportStage | null,
): Record<ImportWorkStep, StepStatus> {
  if (phase === "creating" || phase === "uploading") {
    return {
      uploading: "current",
      reading: "upcoming",
      figures: "upcoming",
      segmenting: "upcoming",
    };
  }
  if (phase === "processing" && (stage === "opening" || stage === null)) {
    return {
      uploading: "done",
      reading: "current",
      figures: "upcoming",
      segmenting: "upcoming",
    };
  }
  if (phase === "processing" && stage === "reading") {
    return {
      uploading: "done",
      reading: "current",
      figures: "current",
      segmenting: "upcoming",
    };
  }
  if (phase === "processing" && stage === "segmenting") {
    return {
      uploading: "done",
      reading: "done",
      figures: "done",
      segmenting: "current",
    };
  }
  return {
    uploading: "done",
    reading: "done",
    figures: "done",
    segmenting: "done",
  };
}

export function readingLine(
  copy: {
    reading: string;
    readingPages: (count: number) => string;
    readingPageOf: (done: number, count: number) => string;
  },
  pageCount: number | null,
  pagesDone: number,
): string {
  if (pageCount === null || pageCount < 1) return copy.reading;
  if (pagesDone < 1) return copy.readingPages(pageCount);
  return copy.readingPageOf(Math.min(pagesDone, pageCount), pageCount);
}
