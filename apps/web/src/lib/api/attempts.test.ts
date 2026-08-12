import { afterEach, describe, expect, it, vi } from "vitest";

import { startAttempt } from "./attempts";

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

describe("startAttempt", () => {
  it("posts to the variant and returns the server's stamp", async () => {
    const fetchMock = stub(
      new Response(
        JSON.stringify({ attempt_id: 5, variant_id: 9, started_at: 1_700_000_000 }),
        { status: 201 },
      ),
    );
    const attempt = await startAttempt("seat", 9);

    expect(attempt).toEqual({ attempt_id: 5, variant_id: 9, started_at: 1_700_000_000 });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/api/v1/variants/9/attempts");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer seat");
  });

  // The whole point of decision 0058: the client never names the time. If this
  // ever sends one, the span stops being evidence and becomes a claim.
  it("sends no body at all, so no client clock can reach the record", async () => {
    const fetchMock = stub(new Response("{}", { status: 201 }));
    await startAttempt("seat", 9);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.body).toBeUndefined();
  });

  it("is null on any failure, so a lost start never costs the student a submission", async () => {
    stub(new Response("{}", { status: 404 }));
    expect(await startAttempt("seat", 9)).toBeNull();
    stub(new Error("offline"));
    expect(await startAttempt("seat", 9)).toBeNull();
  });
});
