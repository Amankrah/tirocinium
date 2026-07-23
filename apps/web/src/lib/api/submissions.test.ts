import { afterEach, describe, expect, it, vi } from "vitest";

import {
  completeSubmission,
  createSubmission,
  getSubmission,
  getSubmissionTranscription,
} from "./submissions";

const PAGES = [{ content_type: "image/jpeg" as const, size_bytes: 2048 }];

describe("createSubmission", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns the presigned upload targets on a 201", async () => {
    const created = {
      submission_id: 5,
      status: "pending",
      storage_prefix: "scans/1/abc",
      uploads: [{ page_index: 0, storage_key: "scans/1/abc/0", url: "https://minio/put" }],
    };
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => created });
    vi.stubGlobal("fetch", fetchSpy);

    expect(await createSubmission("seat_abc", 9, PAGES, "key-1")).toEqual(created);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/variants/9/submissions"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer seat_abc",
          "idempotency-key": "key-1",
        }),
        body: JSON.stringify({ pages: PAGES }),
      }),
    );
  });

  it("returns null when the create is refused", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    expect(await createSubmission("seat_abc", 9, PAGES, "key-1")).toBeNull();
  });

  it("treats a transport failure as null", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    expect(await createSubmission("seat_abc", 9, PAGES, "key-1")).toBeNull();
  });
});

describe("completeSubmission", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns the submission on a 200", async () => {
    const out = { id: 5, variant_id: 9, status: "uploaded", page_count: 1 };
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => out });
    vi.stubGlobal("fetch", fetchSpy);

    expect(await completeSubmission("seat_abc", 5)).toEqual(out);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/submissions/5/complete"),
      expect.objectContaining({
        method: "POST",
        headers: { authorization: "Bearer seat_abc" },
      }),
    );
  });

  it("returns null when complete is refused", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    expect(await completeSubmission("seat_abc", 5)).toBeNull();
  });
});

describe("getSubmission", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns the submission on a 200", async () => {
    const out = { id: 5, variant_id: 9, status: "transcribed", page_count: 2 };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => out }));
    expect(await getSubmission("seat_abc", 5)).toEqual(out);
  });

  it("collapses another seat's submission (404) to null", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    expect(await getSubmission("seat_abc", 5)).toBeNull();
  });
});

describe("getSubmissionTranscription", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns the reading on a 200", async () => {
    const out = {
      submission_id: 5,
      status: "processed",
      recognition_conf: 0.8,
      recognized_markdown: "# Solution",
      pages: [{ page_index: 0, markdown: "# Solution", confidence: 0.8, quality_status: "ok", reject_reason: null, regions: [] }],
    };
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => out });
    vi.stubGlobal("fetch", fetchSpy);
    expect(await getSubmissionTranscription("seat_abc", 5)).toEqual(out);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/submissions/5/transcription"),
      expect.objectContaining({ headers: { authorization: "Bearer seat_abc" } }),
    );
  });

  it("collapses a 404 to null", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    expect(await getSubmissionTranscription("seat_abc", 5)).toBeNull();
  });
});
