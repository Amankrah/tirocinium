import { afterEach, describe, expect, it, vi } from "vitest";

import { getHistory, getUnfold, revealThrough } from "./unfold";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stub(response: Response | Error) {
  const fetchMock = vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function callOf(fetchMock: ReturnType<typeof stub>) {
  return fetchMock.mock.calls[0] as unknown as [string, RequestInit];
}

describe("getUnfold", () => {
  it("returns only the steps the seat has actually unfolded", async () => {
    stub(
      new Response(
        JSON.stringify({
          variant_id: 9,
          total_steps: 5,
          steps_revealed: 2,
          gave_up: false,
          steps: [
            { number: 1, markdown: "First" },
            { number: 2, markdown: "Second" },
          ],
        }),
      ),
    );
    const result = await getUnfold("seat", 3, 9);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The unread steps are genuinely absent, not hidden client-side.
    expect(result.unfold.steps).toHaveLength(2);
    expect(result.unfold.total_steps).toBe(5);
  });

  // A 403 here is a state, not a failure: the seat has neither submitted nor
  // given up, and the surface answers it with the two ways in.
  it("tells a caller apart: not earned yet, versus something went wrong", async () => {
    stub(new Response("{}", { status: 403 }));
    expect(await getUnfold("seat", 3, 9)).toEqual({ ok: false, reason: "not_earned" });

    stub(new Response("{}", { status: 404 }));
    expect(await getUnfold("seat", 3, 9)).toEqual({ ok: false, reason: "unavailable" });

    stub(new Error("offline"));
    expect(await getUnfold("seat", 3, 9)).toEqual({ ok: false, reason: "unavailable" });
  });
});

describe("revealThrough", () => {
  it("posts an absolute step, so a retry can never rewind", async () => {
    const fetchMock = stub(
      new Response(
        JSON.stringify({
          variant_id: 9,
          total_steps: 5,
          steps_revealed: 3,
          gave_up: false,
          steps: [],
        }),
      ),
    );
    await revealThrough("seat", 3, 9, 3);
    const [url, init] = callOf(fetchMock);
    expect(url).toContain("/courses/3/variants/9/solution/reveal");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ through_step: 3 });
  });

  it("is null on a refusal, so the surface keeps what it already had", async () => {
    stub(new Response("{}", { status: 403 }));
    expect(await revealThrough("seat", 3, 9, 2)).toBeNull();
  });
});

describe("getHistory", () => {
  it("reads the seat's own record under its course", async () => {
    const fetchMock = stub(
      new Response(JSON.stringify({ entries: [], next_cursor: null })),
    );
    await getHistory("seat", 3);
    const [url, init] = callOf(fetchMock);
    expect(url).toContain("/api/v1/courses/3/history");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer seat");
    expect(url).not.toContain("cursor");
  });

  it("walks backwards from a cursor when given one", async () => {
    const fetchMock = stub(
      new Response(JSON.stringify({ entries: [], next_cursor: null })),
    );
    await getHistory("seat", 3, { cursor: 42, limit: 10 });
    expect(callOf(fetchMock)[0]).toContain("cursor=42");
    expect(callOf(fetchMock)[0]).toContain("limit=10");
  });

  it("collapses a refusal to null", async () => {
    stub(new Response("{}", { status: 403 }));
    expect(await getHistory("seat", 3)).toBeNull();
  });
});
