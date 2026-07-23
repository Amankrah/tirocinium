// The upload orchestration (frontend guide 4.1, step 3), as a framework-agnostic
// controller: create the submission, PUT each page straight to storage with its
// own progress and per-page retry, then complete. Its side-effects are injected
// (decision 0019) so the sequence is unit-tested without a browser and the React
// layer only binds it to state.
import type { Schemas } from "@/lib/api/client";

export type PageStatus = "queued" | "uploading" | "uploaded" | "failed";

export interface PageProgress {
  index: number;
  status: PageStatus;
  // 0..1; meaningful while uploading, 1 once uploaded.
  fraction: number;
}

export type UploadPhase =
  | "idle"
  | "creating"
  | "uploading"
  | "completing"
  | "submitted"
  | "error";

export interface UploadState {
  phase: UploadPhase;
  submissionId: number | null;
  pages: PageProgress[];
}

// One page to upload: its manifest entry (what create records) and the bytes.
export interface UploadPage {
  manifest: Schemas["PageIn"];
  blob: Blob;
}

// The injected side-effects: the two server actions and the direct-to-storage
// PUT. Keeping the PUT injected is what lets a test drive progress and failure
// deterministically without a network.
export interface UploadDeps {
  create: (
    pages: Schemas["PageIn"][],
    idempotencyKey: string,
  ) => Promise<Schemas["SubmissionCreated"] | null>;
  put: (
    url: string,
    blob: Blob,
    onProgress: (fraction: number) => void,
  ) => Promise<boolean>;
  complete: (submissionId: number) => Promise<boolean>;
  newIdempotencyKey: () => string;
}

export class UploadController {
  private state: UploadState;
  private targets = new Map<number, string>();
  private blobs = new Map<number, Blob>();
  // Generated once and reused across create attempts, so retrying a submission
  // that failed mid-create returns the original row rather than duplicating it.
  private idempotencyKey: string | null = null;

  constructor(
    private readonly deps: UploadDeps,
    private readonly onChange: (state: UploadState) => void,
  ) {
    this.state = { phase: "idle", submissionId: null, pages: [] };
  }

  getState(): UploadState {
    return this.state;
  }

  private emit(next: Partial<UploadState>): void {
    this.state = { ...this.state, ...next };
    this.onChange(this.state);
  }

  private setPage(index: number, patch: Partial<PageProgress>): void {
    const pages = this.state.pages.map((p) =>
      p.index === index ? { ...p, ...patch } : p,
    );
    this.emit({ pages });
  }

  // Run the whole sequence for the given pages. Safe to call again after an
  // error: the idempotency key is reused, so a re-created submission is the
  // same row.
  async run(pages: UploadPage[]): Promise<void> {
    this.blobs = new Map(pages.map((p, i) => [i, p.blob]));
    this.emit({
      phase: "creating",
      pages: pages.map((_, index) => ({
        index,
        status: "queued" as const,
        fraction: 0,
      })),
    });

    if (this.idempotencyKey === null) {
      this.idempotencyKey = this.deps.newIdempotencyKey();
    }
    const created = await this.deps.create(
      pages.map((p) => p.manifest),
      this.idempotencyKey,
    );
    if (created === null) {
      this.emit({ phase: "error" });
      return;
    }
    this.targets = new Map(created.uploads.map((u) => [u.page_index, u.url]));
    this.emit({ phase: "uploading", submissionId: created.submission_id });

    for (const page of this.state.pages) {
      await this.uploadOne(page.index);
    }
    await this.finishIfComplete();
  }

  // Retry a single failed page without touching the others (guide 4.1: retry
  // per page). No-op unless the page is currently failed.
  async retryPage(index: number): Promise<void> {
    const page = this.state.pages.find((p) => p.index === index);
    if (!page || page.status !== "failed") return;
    if (this.state.phase === "error") this.emit({ phase: "uploading" });
    await this.uploadOne(index);
    await this.finishIfComplete();
  }

  private async uploadOne(index: number): Promise<void> {
    const url = this.targets.get(index);
    const blob = this.blobs.get(index);
    if (url === undefined || blob === undefined) {
      this.setPage(index, { status: "failed" });
      return;
    }
    this.setPage(index, { status: "uploading", fraction: 0 });
    let ok = false;
    try {
      ok = await this.deps.put(url, blob, (fraction) =>
        this.setPage(index, { fraction: Math.max(0, Math.min(1, fraction)) }),
      );
    } catch {
      ok = false;
    }
    this.setPage(index, {
      status: ok ? "uploaded" : "failed",
      fraction: ok ? 1 : 0,
    });
  }

  // Once every page is up, complete the manifest; a single failed page holds
  // the submission in error until it is retried.
  private async finishIfComplete(): Promise<void> {
    if (this.state.submissionId === null) return;
    if (this.state.pages.some((p) => p.status !== "uploaded")) {
      if (this.state.pages.some((p) => p.status === "failed")) {
        this.emit({ phase: "error" });
      }
      return;
    }
    this.emit({ phase: "completing" });
    const done = await this.deps.complete(this.state.submissionId);
    this.emit({ phase: done ? "submitted" : "error" });
  }
}
