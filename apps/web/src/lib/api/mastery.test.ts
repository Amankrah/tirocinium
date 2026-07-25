import { afterEach, describe, expect, it, vi } from "vitest";

import { getDistribution, getMastery, getRevisit } from "./mastery";

afterEach(() => vi.unstubAllGlobals());

describe("mastery reads", () => {
  it("reads the mastery picture", async () => {
    const out = { concepts: [{ concept_id: 7, name: "Ohm's law", description: null, label: "solid", m_eff: 0.8, retention: 0.9, due_for_revisit: false, trail: [] }] };
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => out });
    vi.stubGlobal("fetch", fetchSpy);
    expect(await getMastery("seat", 1)).toEqual(out);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/courses/1/mastery"),
      expect.objectContaining({ headers: { authorization: "Bearer seat" } }),
    );
  });

  it("reads the revisit queue", async () => {
    const out = { concepts: [] };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => out }));
    expect(await getRevisit("seat", 1)).toEqual(out);
  });

  it("reads the professor distribution", async () => {
    const out = { concepts: [{ concept_id: 7, name: "Ohm's law", unseen: 1, shaky: 2, developing: 3, solid: 4, gaps: [] }] };
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => out });
    vi.stubGlobal("fetch", fetchSpy);
    expect(await getDistribution("jwt", 1)).toEqual(out);
    expect(fetchSpy.mock.calls[0]![0]).toContain("/api/v1/courses/1/mastery/distribution");
  });

  it("returns null when a seat is refused the picture", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403 }));
    expect(await getMastery("seat", 1)).toBeNull();
  });
});
