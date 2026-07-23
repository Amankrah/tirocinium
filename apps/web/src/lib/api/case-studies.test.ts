import { afterEach, describe, expect, it, vi } from "vitest";

import { getCaseStudy, listCaseStudies } from "./case-studies";

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
