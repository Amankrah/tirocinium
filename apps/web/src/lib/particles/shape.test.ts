import { describe, expect, it } from "vitest";

import { curvePath, curveY, halton, particleCount, resolvedShape } from "./shape";

describe("the resolved curve", () => {
  it("peaks at the centre and falls away on both sides", () => {
    expect(curveY(0)).toBe(1);
    expect(curveY(0.5)).toBeLessThan(curveY(0));
    expect(curveY(-0.5)).toBeCloseTo(curveY(0.5), 12);
    expect(curveY(1)).toBeLessThan(curveY(0.5));
  });

  it("stays inside the viewport at the edges, so the shape never clips", () => {
    expect(curveY(1)).toBeGreaterThan(0);
    expect(curveY(1)).toBeLessThan(0.1);
  });
});

describe("the point cloud", () => {
  it("returns one xy pair per particle", () => {
    expect(resolvedShape(500)).toHaveLength(1_000);
  });

  // Determinism is what makes the hero assertable and what stops it
  // reshuffling on every refresh, which would be noise rather than character.
  it("is identical on every call", () => {
    expect(Array.from(resolvedShape(200))).toEqual(Array.from(resolvedShape(200)));
  });

  it("fills the width and sits under the curve, never above it", () => {
    const points = resolvedShape(2_000);
    let minX = Infinity;
    let maxX = -Infinity;
    for (let i = 0; i < 2_000; i += 1) {
      const x = points[i * 2] as number;
      const y = points[i * 2 + 1] as number;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      // Undo the vertical placement the shape applies, then compare to the
      // curve: a point above its own curve height would break the silhouette.
      const height = (y + 0.85) / 0.9;
      expect(height).toBeGreaterThanOrEqual(-1e-9);
      expect(height).toBeLessThanOrEqual(curveY(x) + 1e-9);
    }
    expect(minX).toBeLessThan(-0.9);
    expect(maxX).toBeGreaterThan(0.9);
  });

  it("stays within clip space, so nothing is drawn off-screen", () => {
    const points = resolvedShape(1_000);
    for (const value of points) {
      expect(value).toBeGreaterThanOrEqual(-1);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it("spreads x evenly rather than clustering, which is the sequence's job", () => {
    const points = resolvedShape(1_000);
    const buckets = new Array(10).fill(0);
    for (let i = 0; i < 1_000; i += 1) {
      const x = points[i * 2] as number;
      buckets[Math.min(9, Math.floor(((x + 1) / 2) * 10))] += 1;
    }
    // A low-discrepancy sequence should put roughly a tenth in each bucket.
    for (const count of buckets) {
      expect(count).toBeGreaterThan(60);
      expect(count).toBeLessThan(140);
    }
  });
});

describe("halton", () => {
  it("stays in the unit interval", () => {
    for (let i = 1; i < 500; i += 1) {
      const value = halton(i);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe("particleCount", () => {
  // Guide 3.3: a few thousand, capped by devicePixelRatio and a capability
  // check. The budget is 3 ms of GPU frame time, and fill rate is what spends
  // it, so a dense screen gets fewer points rather than more.
  it("stays in the low thousands on a desktop", () => {
    const count = particleCount(1, 1_440);
    expect(count).toBeGreaterThan(1_000);
    expect(count).toBeLessThanOrEqual(4_000);
  });

  it("asks for fewer on a dense screen than on a plain one", () => {
    expect(particleCount(3, 1_440)).toBeLessThan(particleCount(1, 1_440));
  });

  it("asks for fewer on a phone than on a desktop", () => {
    expect(particleCount(1, 390)).toBeLessThan(particleCount(1, 1_440));
  });

  it("never drops below a floor where the effect would stop reading", () => {
    expect(particleCount(4, 320)).toBeGreaterThanOrEqual(600);
  });
});

describe("the still's path", () => {
  it("is a single continuous path across the full width", () => {
    const path = curvePath(1_200, 400);
    expect(path.startsWith("M0.00 ")).toBe(true);
    expect(path.match(/M/g)).toHaveLength(1);
    expect(path).toContain("L1200.00 ");
  });

  it("draws the same curve the particles resolve into, apex highest", () => {
    // SVG y grows downward, so the apex is the smallest y in the path.
    const ys = [...curvePath(1_000, 200).matchAll(/[ML][\d.]+ ([\d.]+)/g)].map((m) =>
      Number(m[1]),
    );
    const apex = Math.min(...ys);
    const middle = ys[Math.floor(ys.length / 2)] as number;
    expect(middle).toBeCloseTo(apex, 5);
    expect(ys[0]).toBeGreaterThan(apex);
    expect(ys[ys.length - 1]).toBeGreaterThan(apex);
  });
});
