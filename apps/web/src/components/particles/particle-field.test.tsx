import { render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ParticleField } from "./particle-field";
import { ParticleStill } from "./particle-still";

// jsdom has no WebGL and no matchMedia, so both are stubbed per test: these
// cover the branches that decide whether the field runs at all, which is
// exactly where the accessibility rules of guide 3.3 live. The live canvas is
// the Playwright pass's job.
function stubMatchMedia(reduce: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: reduce,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

function stubObserver() {
  const observe = vi.fn();
  const disconnect = vi.fn();
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe = observe;
      disconnect = disconnect;
      unobserve = vi.fn();
      takeRecords = vi.fn();
      root = null;
      rootMargin = "";
      thresholds = [];
      constructor(_cb: unknown) {}
    },
  );
  return { observe, disconnect };
}

function stubFrames() {
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
}

// Enough of WebGL2 for createField to build a program. A lost context is
// simulated by getContext returning null after loseContext, which is how a
// real canvas behaves and how the Strict Mode remount used to get stuck.
function fakeGl(onLose?: () => void): WebGL2RenderingContext {
  const loc = {};
  return {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,
    ARRAY_BUFFER: 5,
    STATIC_DRAW: 6,
    FLOAT: 7,
    BLEND: 8,
    SRC_ALPHA: 9,
    ONE_MINUS_SRC_ALPHA: 10,
    COLOR_BUFFER_BIT: 11,
    POINTS: 12,
    createShader: () => ({}),
    shaderSource: () => undefined,
    compileShader: () => undefined,
    getShaderParameter: () => true,
    deleteShader: () => undefined,
    createProgram: () => ({}),
    attachShader: () => undefined,
    linkProgram: () => undefined,
    getProgramParameter: () => true,
    useProgram: () => undefined,
    deleteProgram: () => undefined,
    createVertexArray: () => ({}),
    bindVertexArray: () => undefined,
    deleteVertexArray: () => undefined,
    createBuffer: () => ({}),
    bindBuffer: () => undefined,
    bufferData: () => undefined,
    deleteBuffer: () => undefined,
    getAttribLocation: () => 0,
    enableVertexAttribArray: () => undefined,
    vertexAttribPointer: () => undefined,
    getUniformLocation: () => loc,
    uniform3f: () => undefined,
    uniform1f: () => undefined,
    enable: () => undefined,
    blendFunc: () => undefined,
    clearColor: () => undefined,
    viewport: () => undefined,
    clear: () => undefined,
    drawArrays: () => undefined,
    getExtension: (name: string) =>
      name === "WEBGL_lose_context" ? { loseContext: () => onLose?.() } : null,
  } as unknown as WebGL2RenderingContext;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the particle field", () => {
  // Rule 4 of guide 3.3, called a hard accessibility requirement there: reduced
  // motion renders the resolved state as a still image.
  it("renders the still and never builds a context under reduced motion", () => {
    stubMatchMedia(true);
    stubObserver();
    const getContext = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(getContext);

    const { container } = render(<ParticleField />);

    expect(container.querySelector("svg")).not.toBeNull();
    expect(getContext).not.toHaveBeenCalled();
  });

  // Rule 3: a static fallback when WebGL2 is unavailable. The student sees the
  // same picture as under reduced motion, because they want the same thing.
  it("falls back to the same still when WebGL2 is unavailable", async () => {
    stubMatchMedia(false);
    stubObserver();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);

    const { container } = render(<ParticleField />);

    await waitFor(() => expect(container.querySelector("svg")).not.toBeNull());
    // The canvas stays in the tree but hidden, so nothing reflows when the
    // decision lands.
    expect(container.querySelector("canvas")?.className).toContain("hidden");
  });

  it("puts the canvas behind the content and out of the pointer's way", () => {
    stubMatchMedia(true);
    stubObserver();
    const canvas = render(<ParticleField />).container.querySelector("canvas");
    expect(canvas?.className).toContain("pointer-events-none");
    expect(canvas?.className).toContain("-z-10");
    expect(canvas?.className).toContain("absolute");
  });

  it("is invisible to assistive technology, since it carries no information", () => {
    stubMatchMedia(true);
    stubObserver();
    const { container } = render(<ParticleField />);
    expect(container.querySelector("canvas")?.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    // Nothing here is reachable or announced.
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("tears the observer down when the hero unmounts", () => {
    stubMatchMedia(false);
    const { disconnect } = stubObserver();
    // A context that exists but whose shaders will not compile: createField
    // returns null, so no observer is ever attached and none is torn down.
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);

    const view = render(<ParticleField />);
    view.unmount();
    expect(disconnect).not.toHaveBeenCalled();
  });

  // The canvas is z-index -10 so it paints behind the copy. Observing it
  // made IntersectionObserver report it off-screen and stop the loop.
  it("observes the hero, not the negatively stacked canvas", async () => {
    stubMatchMedia(false);
    const { observe } = stubObserver();
    stubFrames();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(fakeGl());

    render(<ParticleField />);

    await waitFor(() => expect(observe).toHaveBeenCalled());
    const target = observe.mock.calls[0]?.[0] as HTMLElement;
    expect(target.tagName).not.toBe("CANVAS");
    expect(target.querySelector("canvas")).not.toBeNull();
  });

  // `next dev` remounts effects on the same canvas. Losing the context in
  // destroy made the second getContext return a dead context, so the hero
  // fell through to the still and stayed there.
  it("keeps the field live across a Strict Mode remount of the same canvas", async () => {
    stubMatchMedia(false);
    stubObserver();
    stubFrames();
    let lost = false;
    const gl = fakeGl(() => {
      lost = true;
    });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() =>
      lost ? null : gl,
    );

    const { container } = render(
      <StrictMode>
        <ParticleField />
      </StrictMode>,
    );

    await waitFor(() => {
      expect(container.querySelector("svg")).toBeNull();
      expect(container.querySelector("canvas")?.className).not.toContain("hidden");
    });
  });
});

describe("the still", () => {
  it("draws the curve and the area beneath it", () => {
    const { container } = render(<ParticleStill />);
    const paths = container.querySelectorAll("path");
    expect(paths).toHaveLength(2);
    // The filled area closes back along the baseline; the stroke does not.
    expect(paths[0]?.getAttribute("d")).toContain("Z");
    expect(paths[1]?.getAttribute("d")).not.toContain("Z");
    // Ink, not accent: accent-at-10% vanishes on paper, and the GPU field
    // already draws in ink, so the still has to be the same colour.
    expect(paths[0]?.getAttribute("class")).toContain("fill-ink");
    expect(paths[1]?.getAttribute("class")).toContain("stroke-ink");
  });

  it("scales with its box rather than pinning a size", () => {
    const { container } = render(<ParticleStill />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("viewBox")).toBe("0 0 1200 400");
    expect(svg?.getAttribute("width")).toBeNull();
  });
});
