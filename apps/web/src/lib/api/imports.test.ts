import { afterEach, describe, expect, it, vi } from "vitest";

import { completeImport, createImport, getImport } from "./imports";

describe("createImport", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("posts the pdf manifest and returns the presigned target on a 201", async () => {
    const created = {
      import_id: 3,
      status: "pending",
      storage_key: "imports/1/abc/source.pdf",
      upload_url: "https://minio/put",
    };
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => created });
    vi.stubGlobal("fetch", fetchSpy);

    expect(await createImport("jwt.abc", 1, 2048, "key-1")).toEqual(created);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/courses/1/imports"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer jwt.abc",
          "idempotency-key": "key-1",
        }),
        body: JSON.stringify({ content_type: "application/pdf", size_bytes: 2048 }),
      }),
    );
  });

  it("returns null when the create is refused", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403 }));
    expect(await createImport("jwt.abc", 1, 2048, "key-1")).toBeNull();
  });

  it("treats a transport failure as null", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    expect(await createImport("jwt.abc", 1, 2048, "key-1")).toBeNull();
  });
});

describe("completeImport", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns the job on a 200", async () => {
    const out = { id: 3, status: "uploaded", page_count: null, created_at: 1 };
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => out });
    vi.stubGlobal("fetch", fetchSpy);
    expect(await completeImport("jwt.abc", 1, 3)).toEqual(out);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/courses/1/imports/3/complete"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("returns null when complete is refused", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    expect(await completeImport("jwt.abc", 1, 3)).toBeNull();
  });
});

describe("getImport", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns the job on a 200", async () => {
    const out = { id: 3, status: "ready", page_count: 42, created_at: 1 };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => out }));
    expect(await getImport("jwt.abc", 1, 3)).toEqual(out);
  });

  it("collapses a non-owner (404) to null", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    expect(await getImport("jwt.abc", 1, 3)).toBeNull();
  });
});
