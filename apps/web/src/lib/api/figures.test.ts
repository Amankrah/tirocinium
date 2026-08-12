import { afterEach, describe, expect, it, vi } from "vitest";

import { figureIdsIn, resolveFigures, resolveFiguresForBodies } from "./figures";

// The fig:// resolver (decision 0066). Constraint 2 is what these pin down: a
// figure token becomes the professor's own pixels at its position, and a token
// that cannot be resolved stays visibly unresolved rather than being faked or
// dropped.
function figureResponse(id: number) {
  return {
    ok: true,
    json: async () => ({
      figure_id: id,
      image_url: `https://storage.example/fig-${id}.png`,
      image_url_2x: `https://storage.example/fig-${id}@2x.png`,
      width_px: 640,
      height_px: 480,
      source: "embedded",
    }),
  } as Response;
}

afterEach(() => vi.unstubAllGlobals());

describe("figureIdsIn", () => {
  it("finds every distinct token in the order it first appears", () => {
    const body = "Intro\n\n![One](fig://12)\n\nThen ![Two](fig://7) and ![again](fig://12).";
    expect(figureIdsIn(body)).toEqual(["12", "7"]);
  });

  it("stops the id at the first character that cannot belong to one", () => {
    expect(figureIdsIn("see (fig://12) and fig://7.")).toEqual(["12", "7"]);
  });

  it("finds nothing in a body with no figures", () => {
    expect(figureIdsIn("Just prose and $x^2$.")).toEqual([]);
  });
});

describe("resolveFigures", () => {
  it("resolves each token to its pixels and both renditions", async () => {
    const fetchMock = vi.fn(async () => figureResponse(12));
    vi.stubGlobal("fetch", fetchMock);

    const map = await resolveFigures("tok", 3, "![Bridge](fig://12)");

    expect(map["12"]).toEqual({
      src: "https://storage.example/fig-12.png",
      src2x: "https://storage.example/fig-12@2x.png",
      width: 640,
      height: 480,
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/api/v1/courses/3/figures/12");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer tok");
  });

  it("asks for each distinct figure once, however often the token repeats", async () => {
    const fetchMock = vi.fn(async () => figureResponse(12));
    vi.stubGlobal("fetch", fetchMock);

    await resolveFigures("tok", 3, "![a](fig://12) ![b](fig://12) ![c](fig://12)");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("makes no request at all for a body with no figures", async () => {
    const fetchMock = vi.fn(async () => figureResponse(12));
    vi.stubGlobal("fetch", fetchMock);

    expect(await resolveFigures("tok", 3, "No figures here.")).toEqual({});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("leaves a figure it cannot resolve out of the map rather than faking one", async () => {
    // A seat asking for a figure it may not read gets the same 404 as one that
    // does not exist, and the surface must show that honestly.
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false }) as Response));

    expect(await resolveFigures("tok", 3, "![Missing](fig://99)")).toEqual({});
  });

  it("survives a network failure without losing the rest of the page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.endsWith("/7") ? Promise.reject(new Error("down")) : figureResponse(12),
      ),
    );

    const map = await resolveFigures("tok", 3, "![a](fig://12) ![b](fig://7)");
    expect(Object.keys(map)).toEqual(["12"]);
  });
});

describe("resolveFiguresForBodies", () => {
  it("shares one round trip per figure across every body it is given", async () => {
    const fetchMock = vi.fn(async () => figureResponse(12));
    vi.stubGlobal("fetch", fetchMock);

    const map = await resolveFiguresForBodies("tok", 3, [
      "![in the question](fig://12)",
      null,
      "![in the solution](fig://12)",
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(map["12"]?.width).toBe(640);
  });
});
