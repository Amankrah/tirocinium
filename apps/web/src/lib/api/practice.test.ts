import { afterEach, describe, expect, it, vi } from "vitest";

import { getPracticeVariant } from "./practice";

describe("getPracticeVariant", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns a variant and passes the exclude", async () => {
    const out = { variant_id: 12, body: "# Variant" };
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => out });
    vi.stubGlobal("fetch", fetchSpy);
    expect(await getPracticeVariant("seat", 1, 2, 11)).toEqual(out);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/courses/1/case-studies/2/practice-variant?exclude=11"),
      expect.objectContaining({ headers: { authorization: "Bearer seat" } }),
    );
  });

  it("omits the exclude when none is given", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ variant_id: null, body: "base" }) });
    vi.stubGlobal("fetch", fetchSpy);
    await getPracticeVariant("seat", 1, 2);
    expect(fetchSpy.mock.calls[0]![0]).not.toContain("exclude");
  });

  it("returns null on any failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    expect(await getPracticeVariant("seat", 1, 2)).toBeNull();
  });
});
