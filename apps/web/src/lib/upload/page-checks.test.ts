import { describe, expect, it } from "vitest";

import {
  ACCEPTED_TYPES,
  BLUR_VARIANCE_THRESHOLD,
  classifySharpness,
  laplacianVariance,
  MAX_PAGE_BYTES,
  validatePageFile,
} from "./page-checks";

describe("validatePageFile mirrors the server's Stage 1 accept rules", () => {
  it.each(ACCEPTED_TYPES)("accepts %s within the size limit", (type) => {
    expect(validatePageFile({ type, size: 1024 })).toBeNull();
  });

  it("rejects a type the server would refuse", () => {
    expect(validatePageFile({ type: "image/gif", size: 1024 })).toBe("type");
    expect(validatePageFile({ type: "image/webp", size: 1024 })).toBe("type");
    expect(validatePageFile({ type: "", size: 1024 })).toBe("type");
  });

  it("rejects a page over the 15 MiB per-page ceiling", () => {
    expect(validatePageFile({ type: "image/jpeg", size: MAX_PAGE_BYTES + 1 })).toBe(
      "too_large",
    );
  });

  it("accepts a page exactly at the ceiling", () => {
    expect(validatePageFile({ type: "image/jpeg", size: MAX_PAGE_BYTES })).toBeNull();
  });

  it("rejects an empty file before anything else", () => {
    expect(validatePageFile({ type: "image/jpeg", size: 0 })).toBe("empty");
  });
});

// Build a grayscale buffer from a per-pixel function, so a test can describe an
// image by its structure rather than a literal byte array.
function grayField(
  width: number,
  height: number,
  at: (x: number, y: number) => number,
): number[] {
  const g: number[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) g.push(at(x, y));
  }
  return g;
}

describe("laplacianVariance separates sharp edges from smooth fields", () => {
  const W = 32;
  const H = 32;

  const flat = grayField(W, H, () => 128);
  // A gentle gradient: smooth, no high-frequency content (a blurred page).
  const gradient = grayField(W, H, (x) => Math.round((x / (W - 1)) * 255));
  // A hard checkerboard: maximal high-frequency edges (a crisply focused page).
  const checker = grayField(W, H, (x, y) => ((x + y) % 2 === 0 ? 0 : 255));

  it("is zero on a flat field", () => {
    expect(laplacianVariance(flat, W, H)).toBe(0);
  });

  it("is near zero on a smooth gradient", () => {
    expect(laplacianVariance(gradient, W, H)).toBeLessThan(BLUR_VARIANCE_THRESHOLD);
  });

  it("is high on a hard-edged pattern", () => {
    expect(laplacianVariance(checker, W, H)).toBeGreaterThan(BLUR_VARIANCE_THRESHOLD);
  });

  it("orders sharper above blurrier", () => {
    expect(laplacianVariance(checker, W, H)).toBeGreaterThan(
      laplacianVariance(gradient, W, H),
    );
  });

  it("returns zero for a buffer too small to have interior pixels", () => {
    expect(laplacianVariance([1, 2, 3, 4], 2, 2)).toBe(0);
  });
});

describe("classifySharpness thresholds the variance", () => {
  it("calls a high-variance page sharp and a low-variance page blurry", () => {
    expect(classifySharpness(BLUR_VARIANCE_THRESHOLD + 1)).toBe("sharp");
    expect(classifySharpness(BLUR_VARIANCE_THRESHOLD - 1)).toBe("blurry");
  });

  it("treats the threshold itself as sharp (lenient by design)", () => {
    expect(classifySharpness(BLUR_VARIANCE_THRESHOLD)).toBe("sharp");
  });
});
