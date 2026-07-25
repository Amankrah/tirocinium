import { afterEach, describe, expect, it, vi } from "vitest";

import {
  addFigureFromBox,
  completeImport,
  confirmItem,
  createImport,
  discardItem,
  getImport,
  getImportItems,
  mergeItems,
  removeFigure,
  setFigureRole,
} from "./imports";

function ok(json: unknown) {
  return { ok: true, status: 200, json: async () => json };
}
function status(code: number) {
  return { ok: false, status: code };
}

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

describe("confirmation verbs", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reads the items list", async () => {
    const items = { items: [{ id: 1 }], pages: [] };
    const fetchSpy = vi.fn().mockResolvedValue(ok(items));
    vi.stubGlobal("fetch", fetchSpy);
    expect(await getImportItems("jwt", 1, 3)).toEqual(items);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/courses/1/imports/3/items"),
      expect.objectContaining({ headers: { authorization: "Bearer jwt" } }),
    );
  });

  it("confirms an item with edits and returns the draft", async () => {
    const out = { case_study_id: 9, item_id: 5, state: "confirmed", text_edit_distance: 2 };
    const fetchSpy = vi.fn().mockResolvedValue(ok(out));
    vi.stubGlobal("fetch", fetchSpy);
    const body = { question_md: "q", solution_md: "s", figure_interventions: 1 };
    expect(await confirmItem("jwt", 1, 5, body)).toEqual(out);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/courses/1/import-items/5/confirm"),
      expect.objectContaining({ method: "POST", body: JSON.stringify(body) }),
    );
  });

  it("discards on a 204 and reports refusal on 409", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 204 }));
    expect(await discardItem("jwt", 1, 5)).toBe(true);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(status(409)));
    expect(await discardItem("jwt", 1, 5)).toBe(false);
  });

  it("merges a source into the survivor", async () => {
    const out = { survivor_id: 5, merged_item_id: 6, question_md: "q", solution_md: null, page_span: "3, 4", confidence: 0.4 };
    const fetchSpy = vi.fn().mockResolvedValue(ok(out));
    vi.stubGlobal("fetch", fetchSpy);
    expect(await mergeItems("jwt", 1, 5, 6)).toEqual(out);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/courses/1/import-items/5/merge"),
      expect.objectContaining({ method: "POST", body: JSON.stringify({ source_item_id: 6 }) }),
    );
  });

  it("collapses a 409 merge (already merged) to null", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(status(409)));
    expect(await mergeItems("jwt", 1, 5, 6)).toBeNull();
  });

  it("draws a box into a new figure", async () => {
    const out = { figure_id: 12, image_url: "https://x", width_px: 100, height_px: 80 };
    const fetchSpy = vi.fn().mockResolvedValue(ok(out));
    vi.stubGlobal("fetch", fetchSpy);
    const body = { page_index: 2, bbox: [0.1, 0.2, 0.3, 0.4] as [number, number, number, number] };
    expect(await addFigureFromBox("jwt", 1, 5, body)).toEqual(out);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/courses/1/import-items/5/figures/from-box"),
      expect.objectContaining({ method: "POST", body: JSON.stringify(body) }),
    );
  });

  it("sets a figure role (PUT) and removes a figure (DELETE)", async () => {
    const putSpy = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal("fetch", putSpy);
    expect(await setFigureRole("jwt", 1, 5, 12, "decorative")).toBe(true);
    expect(putSpy).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/courses/1/import-items/5/figures/12"),
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ role: "decorative" }) }),
    );
    const delSpy = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal("fetch", delSpy);
    expect(await removeFigure("jwt", 1, 5, 12)).toBe(true);
    expect(delSpy).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/courses/1/import-items/5/figures/12"),
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});
