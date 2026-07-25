import { afterEach, describe, expect, it, vi } from "vitest";

import {
  deleteVariant,
  editVariant,
  generateVariants,
  getVariant,
  listVariants,
  promoteVariant,
} from "./variants";

afterEach(() => vi.unstubAllGlobals());

const ok = (json: unknown) => ({ ok: true, status: 200, json: async () => json });

describe("generateVariants", () => {
  it("posts the count with an idempotency key and returns the seeds", async () => {
    const out = { enqueued: 3, seeds: [1, 2, 3] };
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 202, json: async () => out });
    vi.stubGlobal("fetch", fetchSpy);
    expect(await generateVariants("jwt", 1, 2, 3, "key-1")).toEqual(out);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/courses/1/case-studies/2/variants"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "idempotency-key": "key-1" }),
        body: JSON.stringify({ count: 3 }),
      }),
    );
  });

  it("returns null when there is no spec (409)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 409 }));
    expect(await generateVariants("jwt", 1, 2, 3, "key-1")).toBeNull();
  });
});

describe("listVariants", () => {
  it("passes the state filter and returns the page", async () => {
    const page = { items: [{ id: 5, seed: 1, verification: "flagged", flag_reason: "disagree", model_id: "m", created_at: 1 }], next_cursor: null };
    const fetchSpy = vi.fn().mockResolvedValue(ok(page));
    vi.stubGlobal("fetch", fetchSpy);
    expect(await listVariants("jwt", 1, 2, { state: "flagged" })).toEqual(page);
    expect(fetchSpy.mock.calls[0]![0]).toContain("state=flagged");
  });
});

describe("getVariant", () => {
  it("returns the diff detail", async () => {
    const detail = { id: 5, body: "b", solution: "s", verify_solution: "v", final_answers: ["42"], values: { rate: 0.06 }, verification: "flagged", flag_reason: "disagree", model_id: "m", seed: 1, created_at: 1, verify_model_id: "vm", generation_prompt_version: "g/v1", verification_prompt_version: "vv/v1" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok(detail)));
    expect(await getVariant("jwt", 1, 5)).toEqual(detail);
  });
});

describe("promote, edit, delete", () => {
  it("promotes a flagged variant", async () => {
    const summary = { id: 5, seed: 1, verification: "manual", flag_reason: null, model_id: "m", created_at: 1 };
    const fetchSpy = vi.fn().mockResolvedValue(ok(summary));
    vi.stubGlobal("fetch", fetchSpy);
    expect(await promoteVariant("jwt", 1, 5)).toEqual(summary);
    expect(fetchSpy.mock.calls[0]![0]).toContain("/api/v1/courses/1/variants/5/promote");
  });

  it("collapses a 409 promote to null", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 409 }));
    expect(await promoteVariant("jwt", 1, 5)).toBeNull();
  });

  it("edits the body and lands on manual", async () => {
    const summary = { id: 5, seed: 1, verification: "manual", flag_reason: null, model_id: "m", created_at: 1 };
    const fetchSpy = vi.fn().mockResolvedValue(ok(summary));
    vi.stubGlobal("fetch", fetchSpy);
    expect(await editVariant("jwt", 1, 5, { body: "fixed", solution: null })).toEqual(summary);
    expect(fetchSpy.mock.calls[0]![1]).toMatchObject({ method: "PATCH", body: JSON.stringify({ body: "fixed", solution: null }) });
  });

  it("deletes on 204 and reports refusal on 409", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 204 }));
    expect(await deleteVariant("jwt", 1, 5)).toBe(true);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 409 }));
    expect(await deleteVariant("jwt", 1, 5)).toBe(false);
  });
});
