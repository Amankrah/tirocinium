// The PDF import orchestration (frontend guide 4.3, the "import from PDF" door),
// as a framework-agnostic controller with its side-effects injected so the
// create -> PUT -> complete -> poll sequence is unit-tested without a browser or
// a network. Imports have no SSE (unlike submissions), so progress after the
// handshake is a poll of the job's status until it is ready or failed.
import type { Schemas } from "@/lib/api/client";

// Kept in lockstep with app/imports/routes.py.
export const MAX_PDF_BYTES = 60 * 1024 * 1024; // 60 MiB

export type ImportFileRejection = "type" | "too_large" | "empty";

export interface ImportFileLike {
  type: string;
  size: number;
}

export function validateImportFile(
  file: ImportFileLike,
): ImportFileRejection | null {
  if (file.size <= 0) return "empty";
  if (file.type !== "application/pdf") return "type";
  if (file.size > MAX_PDF_BYTES) return "too_large";
  return null;
}

export type ImportPhase =
  | "idle"
  | "creating"
  | "uploading"
  | "processing"
  | "ready"
  | "error";

export interface ImportState {
  phase: ImportPhase;
  importId: number | null;
  // Upload progress, 0..1, meaningful while uploading.
  progress: number;
  // Set once decode reports it.
  pageCount: number | null;
}

export interface ImportDeps {
  create: (
    sizeBytes: number,
    idempotencyKey: string,
  ) => Promise<Schemas["ImportCreated"] | null>;
  put: (
    url: string,
    blob: Blob,
    onProgress: (fraction: number) => void,
  ) => Promise<boolean>;
  complete: (importId: number) => Promise<boolean>;
  poll: (importId: number) => Promise<Schemas["ImportOut"] | null>;
  delay: (ms: number) => Promise<void>;
  newIdempotencyKey: () => string;
}

const POLL_INTERVAL_MS = 2000;
// A generous ceiling so a stuck job surfaces as an error rather than polling
// forever; decode of a large PDF is well within this.
const MAX_POLLS = 300;

export class ImportController {
  private state: ImportState = {
    phase: "idle",
    importId: null,
    progress: 0,
    pageCount: null,
  };
  private idempotencyKey: string | null = null;

  constructor(
    private readonly deps: ImportDeps,
    private readonly onChange: (state: ImportState) => void,
  ) {}

  getState(): ImportState {
    return this.state;
  }

  private emit(next: Partial<ImportState>): void {
    this.state = { ...this.state, ...next };
    this.onChange(this.state);
  }

  // Run the whole sequence. Safe to call again after an error: the idempotency
  // key is reused, so a re-created import is the same job.
  async run(file: Blob): Promise<void> {
    this.emit({ phase: "creating", progress: 0, pageCount: null });
    if (this.idempotencyKey === null) {
      this.idempotencyKey = this.deps.newIdempotencyKey();
    }
    const created = await this.deps.create(file.size, this.idempotencyKey);
    if (created === null) {
      this.emit({ phase: "error" });
      return;
    }
    this.emit({ phase: "uploading", importId: created.import_id });

    const uploaded = await this.deps.put(created.upload_url, file, (fraction) =>
      this.emit({ progress: Math.max(0, Math.min(1, fraction)) }),
    );
    if (!uploaded) {
      this.emit({ phase: "error" });
      return;
    }

    this.emit({ phase: "processing", progress: 1 });
    if (!(await this.deps.complete(created.import_id))) {
      this.emit({ phase: "error" });
      return;
    }
    await this.pollUntilDone(created.import_id);
  }

  private async pollUntilDone(importId: number): Promise<void> {
    for (let i = 0; i < MAX_POLLS; i += 1) {
      const job = await this.deps.poll(importId);
      if (job === null) {
        this.emit({ phase: "error" });
        return;
      }
      if (job.status === "ready") {
        this.emit({ phase: "ready", pageCount: job.page_count });
        return;
      }
      if (job.status === "failed") {
        this.emit({ phase: "error", pageCount: job.page_count });
        return;
      }
      this.emit({ phase: "processing", pageCount: job.page_count });
      await this.deps.delay(POLL_INTERVAL_MS);
    }
    // Exhausted the ceiling without a terminal status.
    this.emit({ phase: "error" });
  }
}
