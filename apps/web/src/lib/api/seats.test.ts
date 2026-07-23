import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchSeatMe,
  generateSeatBatch,
  listSeats,
  redeemSeatCode,
  reissueSeat,
  revokeSeat,
} from "./seats";

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

// The professor side of the seat lifecycle: list, generate a batch (its codes
// live only in the returned artifact URLs), revoke, and reissue.
describe("listSeats", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns the course's seats on a 200", async () => {
    const seats = [
      {
        id: 1,
        seat_number: "S-001",
        status: "active",
        last_used_at: null,
        submission_count: 0,
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ seats }) }),
    );
    expect(await listSeats("jwt.abc", 7)).toEqual(seats);
  });

  it("returns an empty list on any failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403 }));
    expect(await listSeats("jwt.abc", 7)).toEqual([]);
  });
});

describe("generateSeatBatch", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("posts the count and returns the artifact URLs on a 201", async () => {
    const batch = { count: 30, csv_url: "https://x/codes.csv", pdf_url: "https://x/codes.pdf" };
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => batch });
    vi.stubGlobal("fetch", fetchSpy);
    expect(await generateSeatBatch("jwt.abc", 7, 30)).toEqual(batch);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/courses/7/seats"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ count: 30 }),
      }),
    );
  });

  it("returns null when generation is refused", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403 }));
    expect(await generateSeatBatch("jwt.abc", 7, 30)).toBeNull();
  });
});

describe("revokeSeat", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns the revoked seat on a 200", async () => {
    const out = { seat_number: "S-001", status: "revoked" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => out }));
    expect(await revokeSeat("jwt.abc", 1)).toEqual(out);
  });

  it("returns null when revoke is refused", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    expect(await revokeSeat("jwt.abc", 1)).toBeNull();
  });
});

describe("reissueSeat", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns the seat and its one-time plaintext code on a 200", async () => {
    const out = { seat_number: "S-001", code: "81H2-0FDS-1DRE-A8DY" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => out }));
    expect(await reissueSeat("jwt.abc", 1)).toEqual(out);
  });

  it("returns null when reissue is refused", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    expect(await reissueSeat("jwt.abc", 1)).toBeNull();
  });
});
