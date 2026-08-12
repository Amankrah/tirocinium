import { afterEach, describe, expect, it, vi } from "vitest";

import { openConversation, streamUrl } from "./defence";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function stubFetch(response: Response | Error) {
  const fetchMock = vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("openConversation", () => {
  it("posts with the seat token and returns the session", async () => {
    const body = {
      conversation_id: 12,
      submission_id: 34,
      status: "active",
      stream_path: "/api/v1/conversations/12/stream",
    };
    const fetchMock = stubFetch(
      new Response(JSON.stringify(body), { status: 201 }),
    );

    const result = await openConversation("seat-token", 34);

    expect(result).toEqual({ ok: true, conversation: body });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toContain("/api/v1/submissions/34/conversation");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).authorization).toBe(
      "Bearer seat-token",
    );
  });

  it("reads the course's concurrency cap as busy, which the copy can be honest about", async () => {
    stubFetch(new Response("{}", { status: 409 }));
    expect(await openConversation("seat-token", 34)).toEqual({
      ok: false,
      reason: "busy",
    });
  });

  it("collapses every other failure, and a dead network, to unavailable", async () => {
    stubFetch(new Response("{}", { status: 404 }));
    expect(await openConversation("seat-token", 34)).toEqual({
      ok: false,
      reason: "unavailable",
    });

    stubFetch(new Error("offline"));
    expect(await openConversation("seat-token", 34)).toEqual({
      ok: false,
      reason: "unavailable",
    });
  });
});

describe("streamUrl", () => {
  it("switches the API origin to the websocket scheme and carries the token", () => {
    vi.stubEnv("API_BASE_URL", "http://localhost:8000");
    expect(streamUrl("seat-token", "/api/v1/conversations/12/stream")).toBe(
      "ws://localhost:8000/api/v1/conversations/12/stream?token=seat-token",
    );
  });

  it("uses the secure scheme when the API is https", () => {
    vi.stubEnv("API_BASE_URL", "https://api.example.edu");
    expect(streamUrl("t", "/api/v1/conversations/1/stream")).toBe(
      "wss://api.example.edu/api/v1/conversations/1/stream?token=t",
    );
  });

  it("escapes a token that would otherwise break the query", () => {
    vi.stubEnv("API_BASE_URL", "https://api.example.edu");
    expect(streamUrl("a b&c=d", "/s")).toBe(
      "wss://api.example.edu/s?token=a%20b%26c%3Dd",
    );
  });
});
