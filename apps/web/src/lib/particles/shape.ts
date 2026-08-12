// The shape the particle field resolves into (frontend guide 3.3: "a curve, a
// distribution, the suggestion of a solved problem"). A normal distribution is
// all three at once, which is why it is the one.
//
// Everything here is pure and runs exactly once, at init: the target positions
// are uploaded as a static attribute buffer and the SVG still is drawn from the
// same functions, so the resolved state a student sees under reduced motion is
// the same shape the GPU resolves into rather than a second drawing that can
// drift from it. Nothing in this file runs per frame.

// Standard normal, unnormalised: peak 1 at x = 0. The field lives in clip space,
// so x runs -1 to 1 and this is shaped to fill it pleasantly rather than to be
// statistically exact.
export function curveY(x: number): number {
  const spread = 0.42;
  return Math.exp(-(x * x) / (2 * spread * spread));
}

// A deterministic low-discrepancy sequence (the golden-ratio additive
// recurrence). Seeded by index rather than Math.random so the field is identical
// on every load and in every test: a hero that reshuffles on refresh is noise,
// and an unseeded one cannot be asserted.
export function halton(index: number): number {
  const golden = 0.618_033_988_749_895;
  return (index * golden) % 1;
}

// The resolved cloud: `count` points filling the area under the curve, which
// reads as a distribution rather than as a wire. Returned as flat xy pairs in
// clip space, ready to become a vec2 attribute.
export function resolvedShape(count: number): Float32Array {
  const points = new Float32Array(count * 2);
  for (let i = 0; i < count; i += 1) {
    // Two decorrelated streams from one index, so x and the fill depth do not
    // march together and stripe the cloud.
    const u = halton(i + 1);
    const v = halton((i + 1) * 3 + 7);
    const x = u * 2 - 1;
    // Fill from the axis up to the curve. The square root biases points towards
    // the top edge, which keeps the curve legible instead of a solid blob.
    const y = curveY(x) * Math.sqrt(v);
    points[i * 2] = x;
    // Sit the cloud on the lower half of the viewport: the hero's text occupies
    // the middle, and the field is behind it.
    points[i * 2 + 1] = y * 0.9 - 0.85;
  }
  return points;
}

// How many particles to run. "A few thousand" (guide 3.3), capped by pixel
// density and viewport so a dense phone screen does not pay for points it
// cannot resolve; the budget is 3 ms of GPU frame time, and fill rate, not
// vertex count, is what threatens it.
export function particleCount(devicePixelRatio: number, width: number): number {
  const base = width < 640 ? 1_600 : 3_200;
  const scaled = devicePixelRatio > 1.5 ? base * 0.6 : base;
  return Math.max(600, Math.round(scaled));
}

// The still, as an SVG path over a viewBox of the given size: the resolved
// curve itself, drawn once. This is what renders under prefers-reduced-motion
// and when WebGL2 is unavailable, so it is the resolved state as a picture
// exactly as guide 3.3 requires, not an approximation of one.
export function curvePath(width: number, height: number, samples = 64): string {
  const commands: string[] = [];
  for (let i = 0; i <= samples; i += 1) {
    const t = i / samples;
    const x = t * 2 - 1;
    // Clip space y is up, SVG y is down.
    const px = ((x + 1) / 2) * width;
    const py = height - curveY(x) * height * 0.9;
    commands.push(`${i === 0 ? "M" : "L"}${px.toFixed(2)} ${py.toFixed(2)}`);
  }
  return commands.join(" ");
}
