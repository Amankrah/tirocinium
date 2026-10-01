import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createCaseStudy,
  getCaseStudy,
  listAllCaseStudies,
  listCaseStudies,
  setCaseStudyPublished,
} from "./case-studies";

function listed(id: number) {
  return {
    id,
    title: `Case ${id}`,
    status: "published",
    concepts: [],
    created_at: 0,
    updated_at: 0,
  };
}

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

describe("listAllCaseStudies", () => {
  it("follows next_cursor until every published problem is in hand", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [listed(1)], next_cursor: 1 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [listed(2)], next_cursor: null }),
      });
    vi.stubGlobal("fetch", fetchSpy);
    expect(await listAllCaseStudies("seat_abc", 7)).toEqual([listed(1), listed(2)]);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const firstUrl = String(fetchSpy.mock.calls[0]?.[0]);
    const secondUrl = String(fetchSpy.mock.calls[1]?.[0]);
    expect(firstUrl).toContain("limit=100");
    expect(firstUrl).not.toContain("cursor=");
    expect(secondUrl).toContain("cursor=1");
  });

  it("returns an empty list when the first page fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    expect(await listAllCaseStudies("seat_abc", 7)).toEqual([]);
  });

  it("keeps earlier pages when a later page fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ items: [listed(1)], next_cursor: 1 }),
        })
        .mockResolvedValueOnce({ ok: false, status: 500 }),
    );
    expect(await listAllCaseStudies("seat_abc", 7)).toEqual([listed(1)]);
  });

  it("stops if a cursor does not advance", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [listed(5)], next_cursor: 5 }),
    });
    vi.stubGlobal("fetch", fetchSpy);
    expect(await listAllCaseStudies("seat_abc", 7)).toEqual([listed(5)]);
    expect(fetchSpy.mock.calls.length).toBeLessThan(5);
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
