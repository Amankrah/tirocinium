import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchProfessor, professorLogin } from "./auth";

// Backend guide 7.1: login's failure is one generic outcome (401, unknown
// email and wrong password indistinguishable), and to the professor a backend
// outage is the same. Only a 200 carries a session forward.
describe("professorLogin", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns the auth payload on a 200", async () => {
    const auth = {
      token: "jwt.abc",
      professor: { id: 1, email: "prof@uni.edu", role: "professor" },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => auth }),
    );
    expect(await professorLogin("prof@uni.edu", "secretpass1")).toEqual({
      ok: true,
      auth,
    });
  });

  it("collapses bad credentials (401) to the one failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    expect(await professorLogin("prof@uni.edu", "wrong")).toEqual({ ok: false });
  });

  it("treats a backend outage as the same failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    expect(await professorLogin("prof@uni.edu", "secretpass1")).toEqual({
      ok: false,
    });
  });
});

describe("fetchProfessor", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns the identity for a professor token", async () => {
    const identity = { role: "professor", user_id: 1, email: "prof@uni.edu" };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => identity }),
    );
    expect(await fetchProfessor("jwt.abc")).toEqual(identity);
  });

  it("rejects a non-professor role even on a 200", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ role: "seat", seat_number: "S-001" }),
      }),
    );
    expect(await fetchProfessor("seat_abc")).toBeNull();
  });

  it("returns null when the session is not accepted", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    expect(await fetchProfessor("jwt.stale")).toBeNull();
  });

  it("presents the token as a bearer credential", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ role: "professor", email: "prof@uni.edu" }),
    });
    vi.stubGlobal("fetch", fetchSpy);
    await fetchProfessor("jwt.abc");
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/auth/me"),
      expect.objectContaining({ headers: { authorization: "Bearer jwt.abc" } }),
    );
  });
});
