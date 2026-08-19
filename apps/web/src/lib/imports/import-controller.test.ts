import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ImportController,
  type ImportDeps,
  type ImportState,
  MAX_PDF_BYTES,
  validateImportFile,
} from "./import-controller";

describe("validateImportFile", () => {
  it("accepts a pdf within the size ceiling", () => {
    expect(validateImportFile({ type: "application/pdf", size: 4096 })).toBeNull();
  });

  it("rejects a non-pdf", () => {
    expect(validateImportFile({ type: "image/png", size: 4096 })).toBe("type");
  });

  it("rejects a pdf over 60 MiB", () => {
    expect(
      validateImportFile({ type: "application/pdf", size: MAX_PDF_BYTES + 1 }),
    ).toBe("too_large");
  });

  it("rejects an empty file", () => {
    expect(validateImportFile({ type: "application/pdf", size: 0 })).toBe("empty");
  });
});

function created(importId = 3) {
  return {
    import_id: importId,
    status: "pending",
    storage_key: "imports/1/x/source.pdf",
    upload_url: "https://minio/put",
  };
}

function job(
  status: string,
  pageCount: number | null = null,
  extra: { pages_done?: number; stage?: "opening" | "reading" | "segmenting" | null } = {},
) {
  return {
    id: 3,
    status,
    page_count: pageCount,
    pages_done: extra.pages_done ?? (pageCount ?? 0),
    stage: extra.stage ?? null,
    created_at: 1,
  };
}

function deps(over: Partial<ImportDeps> = {}): ImportDeps {
  return {
    create: vi.fn().mockResolvedValue(created()),
    put: vi.fn().mockResolvedValue(true),
    complete: vi.fn().mockResolvedValue(true),
    poll: vi.fn().mockResolvedValue(job("ready", 42)),
    delay: vi.fn().mockResolvedValue(undefined),
    newIdempotencyKey: vi.fn().mockReturnValue("key-1"),
    ...over,
  };
}

function track() {
  const states: ImportState[] = [];
  return { states, onChange: (s: ImportState) => states.push({ ...s }) };
}

const pdf = new Blob(["%PDF-1.4"], { type: "application/pdf" });

describe("ImportController", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates, uploads, completes, then polls to ready", async () => {
    const d = deps();
    const c = new ImportController(d, track().onChange);
    await c.run(pdf);

    expect(d.create).toHaveBeenCalledWith(pdf.size, "key-1");
    expect(d.put).toHaveBeenCalledOnce();
    expect(d.complete).toHaveBeenCalledWith(3);
    expect(c.getState()).toMatchObject({ phase: "ready", importId: 3, pageCount: 42 });
  });

  it("records whole-run elapsed seconds on ready", async () => {
    let now = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const poll = vi.fn().mockImplementation(async () => {
      now += 105_000;
      return job("ready", 12);
    });
    const c = new ImportController(deps({ poll }), track().onChange);
    await c.run(pdf);
    expect(c.getState()).toMatchObject({
      phase: "ready",
      elapsedSeconds: 105,
    });
  });

  it("keeps polling through processing until ready", async () => {
    const poll = vi
      .fn()
      .mockResolvedValueOnce(job("processing"))
      .mockResolvedValueOnce(job("processing", 10))
      .mockResolvedValueOnce(job("ready", 10));
    const d = deps({ poll });
    const { states, onChange } = track();
    const c = new ImportController(d, onChange);
    await c.run(pdf);

    expect(poll).toHaveBeenCalledTimes(3);
    expect(d.delay).toHaveBeenCalledTimes(2); // between the three polls
    expect(c.getState().phase).toBe("ready");
    expect(states.some((s) => s.phase === "processing")).toBe(true);
  });

  it("carries the server stage while processing", async () => {
    const poll = vi
      .fn()
      .mockResolvedValueOnce(
        job("processing", 9, { pages_done: 3, stage: "reading" }),
      )
      .mockResolvedValueOnce(job("ready", 9, { pages_done: 9, stage: null }));
    const { states, onChange } = track();
    const c = new ImportController(deps({ poll }), onChange);
    await c.run(pdf);
    expect(states.some((s) => s.stage === "reading" && s.pagesDone === 3)).toBe(
      true,
    );
    expect(c.getState()).toMatchObject({ phase: "ready", pagesDone: 9, stage: null });
  });

  it("errors when create is refused, without uploading", async () => {
    const d = deps({ create: vi.fn().mockResolvedValue(null) });
    const c = new ImportController(d, track().onChange);
    await c.run(pdf);
    expect(c.getState().phase).toBe("error");
    expect(d.put).not.toHaveBeenCalled();
  });

  it("errors when the upload fails, without completing", async () => {
    const d = deps({ put: vi.fn().mockResolvedValue(false) });
    const c = new ImportController(d, track().onChange);
    await c.run(pdf);
    expect(c.getState().phase).toBe("error");
    expect(d.complete).not.toHaveBeenCalled();
  });

  it("errors when decode reports failed", async () => {
    const d = deps({ poll: vi.fn().mockResolvedValue(job("failed")) });
    const c = new ImportController(d, track().onChange);
    await c.run(pdf);
    expect(c.getState().phase).toBe("error");
  });

  it("reuses one idempotency key across a re-run after a failed create", async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(created());
    const d = deps({ create });
    const c = new ImportController(d, track().onChange);
    await c.run(pdf);
    await c.run(pdf);
    expect(d.newIdempotencyKey).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenNthCalledWith(1, pdf.size, "key-1");
    expect(create).toHaveBeenNthCalledWith(2, pdf.size, "key-1");
    expect(c.getState().phase).toBe("ready");
  });
});
