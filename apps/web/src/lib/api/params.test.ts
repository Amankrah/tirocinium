import { afterEach, describe, expect, it, vi } from "vitest";

import {
  autoParameterize,
  deleteParamSpec,
  getParamSpec,
  saveParamSpec,
} from "./params";

const spec = {
  parameters: { rate: { type: "number" as const, base: 0.08, range: [0.04, 0.12] as [number, number] } },
  invariants: ["NPV positive"],
  solution_method: null,
};

describe("getParamSpec", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns the spec on a 200", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => spec }));
    expect(await getParamSpec("jwt", 1, 2)).toEqual(spec);
  });

  it("treats a 404 (no spec yet) as null", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    expect(await getParamSpec("jwt", 1, 2)).toBeNull();
  });
});

describe("saveParamSpec", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns ok with the saved spec on a 200", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => spec });
    vi.stubGlobal("fetch", fetchSpy);
    expect(await saveParamSpec("jwt", 1, 2, spec)).toEqual({ ok: spec });
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/courses/1/case-studies/2/param-spec"),
      expect.objectContaining({ method: "PUT", body: JSON.stringify(spec) }),
    );
  });

  it("surfaces the frozen-check block on a 409", async () => {
    const blocked = [{ parameter: "resistance", figure_id: 3, value: "4.7 kΩ", reason: "appears in Figure 2" }];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 409, json: async () => ({ status: 409, title: "Conflict", type: "about:blank", blocked }) }),
    );
    expect(await saveParamSpec("jwt", 1, 2, spec)).toEqual({ blocked });
  });

  it("reports a generic error otherwise", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 422 }));
    expect(await saveParamSpec("jwt", 1, 2, spec)).toEqual({ error: true });
  });
});

describe("deleteParamSpec and autoParameterize", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("deletes on a 204", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 204 }));
    expect(await deleteParamSpec("jwt", 1, 2)).toBe(true);
  });

  it("returns the proposal on a 200 and carries the idempotency key", async () => {
    const proposal = { proposal_id: 5, spec, annotations: {}, invariant_rationales: [], frozen: [], provenance: { model_id: "m", prompt_version: "auto-parameterize/v1" } };
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => proposal });
    vi.stubGlobal("fetch", fetchSpy);
    expect(await autoParameterize("jwt", 1, 2, "key-1")).toEqual(proposal);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/auto-parameterize"),
      expect.objectContaining({ method: "POST", headers: expect.objectContaining({ "idempotency-key": "key-1" }) }),
    );
  });
});
