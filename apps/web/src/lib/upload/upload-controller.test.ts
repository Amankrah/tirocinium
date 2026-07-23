import { describe, expect, it, vi } from "vitest";

import {
  UploadController,
  type UploadDeps,
  type UploadPage,
  type UploadState,
} from "./upload-controller";

// A tiny blob stands in for page bytes; the controller only ever forwards it.
function page(index: number): UploadPage {
  return {
    manifest: { content_type: "image/jpeg", size_bytes: 1024 },
    blob: new Blob([`page-${index}`]),
  };
}

function createdFor(count: number, submissionId = 7) {
  return {
    submission_id: submissionId,
    status: "pending",
    storage_prefix: "scans/1/abc",
    uploads: Array.from({ length: count }, (_, i) => ({
      page_index: i,
      storage_key: `scans/1/abc/${i}`,
      url: `https://minio/put/${i}`,
    })),
  };
}

// A deps builder with sensible happy-path defaults each test can override.
function deps(over: Partial<UploadDeps> = {}): UploadDeps {
  return {
    create: vi.fn().mockResolvedValue(createdFor(2)),
    put: vi.fn().mockResolvedValue(true),
    complete: vi.fn().mockResolvedValue(true),
    newIdempotencyKey: vi.fn().mockReturnValue("key-1"),
    ...over,
  };
}

function track() {
  const states: UploadState[] = [];
  return { states, onChange: (s: UploadState) => states.push(structuredClone(s)) };
}

describe("UploadController happy path", () => {
  it("creates, uploads every page, then completes to submitted", async () => {
    const d = deps();
    const { states, onChange } = track();
    const c = new UploadController(d, onChange);

    await c.run([page(0), page(1)]);

    expect(d.create).toHaveBeenCalledWith(
      [page(0).manifest, page(1).manifest],
      "key-1",
    );
    expect(d.put).toHaveBeenCalledTimes(2);
    expect(d.complete).toHaveBeenCalledWith(7);
    const final = c.getState();
    expect(final.phase).toBe("submitted");
    expect(final.submissionId).toBe(7);
    expect(final.pages.every((p) => p.status === "uploaded")).toBe(true);
    // The phase actually passed through creating and uploading, not jumped.
    expect(states.map((s) => s.phase)).toContain("creating");
    expect(states.map((s) => s.phase)).toContain("uploading");
  });

  it("reports per-page progress as the PUT advances", async () => {
    const seen: number[] = [];
    const d = deps({
      put: vi.fn().mockImplementation(async (_u, _b, onProgress) => {
        onProgress(0.5);
        onProgress(1);
        return true;
      }),
    });
    const { states, onChange } = track();
    await new UploadController(d, onChange).run([page(0)]);
    const fractions = states.flatMap((s) => s.pages.map((p) => p.fraction));
    for (const f of fractions) seen.push(f);
    expect(Math.max(...seen)).toBe(1);
  });
});

describe("UploadController failure and retry", () => {
  it("holds in error when a page PUT fails and does not complete", async () => {
    const put = vi
      .fn()
      .mockResolvedValueOnce(true) // page 0 ok
      .mockResolvedValueOnce(false); // page 1 fails
    const d = deps({ put });
    const c = new UploadController(d, track().onChange);

    await c.run([page(0), page(1)]);

    expect(c.getState().phase).toBe("error");
    expect(d.complete).not.toHaveBeenCalled();
    const failed = c.getState().pages.find((p) => p.status === "failed");
    expect(failed?.index).toBe(1);
  });

  it("retries only the failed page and then completes", async () => {
    const put = vi
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
      .mockResolvedValue(true); // the retry
    const d = deps({ put });
    const c = new UploadController(d, track().onChange);

    await c.run([page(0), page(1)]);
    expect(c.getState().phase).toBe("error");

    await c.retryPage(1);

    expect(c.getState().phase).toBe("submitted");
    expect(d.put).toHaveBeenCalledTimes(3); // 2 initial + 1 retry
    expect(d.complete).toHaveBeenCalledTimes(1);
  });

  it("does nothing when retrying a page that is not failed", async () => {
    const d = deps();
    const c = new UploadController(d, track().onChange);
    await c.run([page(0), page(1)]);
    (d.put as ReturnType<typeof vi.fn>).mockClear();

    await c.retryPage(0); // already uploaded
    expect(d.put).not.toHaveBeenCalled();
  });

  it("errors without uploading when create is refused", async () => {
    const d = deps({ create: vi.fn().mockResolvedValue(null) });
    const c = new UploadController(d, track().onChange);

    await c.run([page(0)]);

    expect(c.getState().phase).toBe("error");
    expect(d.put).not.toHaveBeenCalled();
  });

  it("reuses one idempotency key across a re-run after a failed create", async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce(null) // first attempt fails
      .mockResolvedValueOnce(createdFor(1));
    const d = deps({ create });
    const c = new UploadController(d, track().onChange);

    await c.run([page(0)]);
    await c.run([page(0)]);

    expect(d.newIdempotencyKey).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenNthCalledWith(1, [page(0).manifest], "key-1");
    expect(create).toHaveBeenNthCalledWith(2, [page(0).manifest], "key-1");
    expect(c.getState().phase).toBe("submitted");
  });

  it("marks the submission error when complete is refused", async () => {
    const d = deps({ complete: vi.fn().mockResolvedValue(false) });
    const c = new UploadController(d, track().onChange);
    await c.run([page(0)]);
    expect(c.getState().phase).toBe("error");
  });
});
