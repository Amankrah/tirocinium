import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createCaseStudy,
  getCaseStudy,
  listCaseStudies,
  setCaseStudyPublished,
} from "./case-studies";

afterEach(() => vi.unstubAllGlobals());

describe("listCaseStudies", () => {
  it("returns the published items on a 200", async () => {
    const items = [
      { id: 1, title: "Bridge", status: "published", concepts: [], created_at: 0, updated_at: 0 },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ items, next_cursor: null }),
      }),
    );
    expect(await listCaseStudies("seat_abc", 7)).toEqual(items);
  });

  it("returns an empty list on any failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    expect(await listCaseStudies("seat_abc", 7)).toEqual([]);
  });

  it("carries the seat token as a bearer credential", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [], next_cursor: null }),
    });
    vi.stubGlobal("fetch", fetchSpy);
    await listCaseStudies("seat_abc", 7);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/courses/7/case-studies"),
      expect.objectContaining({ headers: { authorization: "Bearer seat_abc" } }),
    );
  });
});

describe("getCaseStudy", () => {
  it("returns the detail on a 200", async () => {
    const detail = {
      id: 3,
      title: "Bridge",
      status: "published",
      body: "# Bridge",
      concepts: [],
      created_at: 0,
      updated_at: 0,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => detail }),
    );
    expect(await getCaseStudy("seat_abc", 7, 3)).toEqual(detail);
  });

  it("returns null when the case study is not visible (404)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    expect(await getCaseStudy("seat_abc", 7, 999)).toBeNull();
  });
});

describe("createCaseStudy", () => {
  it("posts the draft and returns the created detail", async () => {
    const detail = {
      id: 9,
      title: "New case",
      status: "draft",
      body: "# New case",
      concepts: [],
      created_at: 0,
      updated_at: 0,
    };
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => detail });
    vi.stubGlobal("fetch", fetchSpy);
    expect(
      await createCaseStudy("jwt.abc", 7, { title: "New case", body: "# New case" }),
    ).toEqual(detail);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/courses/7/case-studies"),
      expect.objectContaining({ method: "POST" }),
    );
  });
});

describe("setCaseStudyPublished", () => {
  it("posts to publish and reports success", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchSpy);
    expect(await setCaseStudyPublished("jwt.abc", 7, 3, true)).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/courses/7/case-studies/3/publish"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("posts to unpublish when published is false", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchSpy);
    await setCaseStudyPublished("jwt.abc", 7, 3, false);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/case-studies/3/unpublish"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("reports failure without throwing on a network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    expect(await setCaseStudyPublished("jwt.abc", 7, 3, true)).toBe(false);
  });
});
