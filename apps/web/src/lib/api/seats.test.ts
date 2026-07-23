import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchSeatMe, redeemSeatCode } from "./seats";

// Backend guide 7.1 and guide 4.0: redemption's every failure (wrong, revoked,
// unknown, or malformed code as 401; rate limited as 429) collapses to the one
// honest result for the student, and so does a backend outage. Only a 200
// carries a session forward.
describe("redeemSeatCode", () => {
  afterEach(() => vi.unstubAllGlobals());

  const FULL_CODE = "MK4T9RWFC2HPX6ZD";

  it("returns the session on a 200", async () => {
    const session = {
      token: "seat_abc",
      seat_number: "S-001",
      course_id: 1,
      course_title: "Thermodynamics",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => session }),
    );
    expect(await redeemSeatCode(FULL_CODE)).toEqual({ ok: true, session });
  });

  it("collapses a rejected code (401) to the one failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401 }),
    );
    expect(await redeemSeatCode(FULL_CODE)).toEqual({ ok: false });
  });

  it("collapses rate limiting (429) to the same failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 429 }),
    );
    expect(await redeemSeatCode(FULL_CODE)).toEqual({ ok: false });
  });

  it("treats a backend outage as the same failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    expect(await redeemSeatCode(FULL_CODE)).toEqual({ ok: false });
  });
});

describe("fetchSeatMe", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns the seat on a 200", async () => {
    const seat = { seat_number: "S-001", course_id: 1, course_title: "Thermodynamics" };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => seat }),
    );
    expect(await fetchSeatMe("seat_abc")).toEqual(seat);
  });

  it("returns null when the session is not accepted", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401 }),
    );
    expect(await fetchSeatMe("seat_bad")).toBeNull();
  });

  it("presents the token as a bearer credential", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ seat_number: "S-001", course_id: 1, course_title: "X" }),
    });
    vi.stubGlobal("fetch", fetchSpy);
    await fetchSeatMe("seat_abc");
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/seats/me"),
      expect.objectContaining({ headers: { authorization: "Bearer seat_abc" } }),
    );
  });
});
