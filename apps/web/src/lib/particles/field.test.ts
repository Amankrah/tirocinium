import { describe, expect, it } from "vitest";

import { createField, inkOnPaper, resolveAt } from "./field";

// The resolve timeline is the moment itself (guide 3.3): drift, resolve briefly
// into structure, relax back to ambient motion, and stay there. Pure, so the
// shape of it is asserted without a GPU.
describe("the resolve timeline", () => {
  it("starts in ambient scatter", () => {
    expect(resolveAt(0)).toBe(0);
    expect(resolveAt(0.3)).toBe(0);
  });

  it("rises into the resolved shape", () => {
    expect(resolveAt(0.6)).toBeGreaterThan(0);
    expect(resolveAt(0.6)).toBeLessThan(1);
    expect(resolveAt(1.2)).toBeGreaterThan(resolveAt(0.6));
  });

  it("holds the structure briefly rather than flashing it", () => {
    expect(resolveAt(1.6)).toBe(1);
    expect(resolveAt(2.5)).toBe(1);
    // The hold is long enough to read and short enough not to be a state.
    expect(resolveAt(3.1)).toBe(1);
  });

  it("relaxes back and then stays ambient for good", () => {
    expect(resolveAt(4)).toBeLessThan(1);
    expect(resolveAt(4)).toBeGreaterThan(0);
    expect(resolveAt(6)).toBe(0);
    expect(resolveAt(600)).toBe(0);
    // Nothing else on the platform animates ambiently, and neither does this
    // after its one moment: it drifts, it never re-resolves.
    expect(resolveAt(3_600)).toBe(0);
  });

  it("never leaves the 0..1 range the shader mixes over", () => {
    for (let t = 0; t < 20; t += 0.05) {
      expect(resolveAt(t)).toBeGreaterThanOrEqual(0);
      expect(resolveAt(t)).toBeLessThanOrEqual(1);
    }
  });
});

describe("inkOnPaper", () => {
  // Token values from tokens.css, as 0..1 channels. Light-theme ink is dark
  // and must take the heavier paper weight; dark-theme ink is light and must
  // not, or the stipple the user already has would blow out.
  it("treats the light-theme ink as graphite on paper", () => {
    expect(inkOnPaper([0x16 / 255, 0x1a / 255, 0x23 / 255])).toBe(true);
  });

  it("treats the dark-theme ink as chalk on ground", () => {
    expect(inkOnPaper([0xe8 / 255, 0xe6 / 255, 0xdf / 255])).toBe(false);
  });
});

describe("createField", () => {
  // Every way the field cannot run answers the same way, because the caller's
  // response to all of them is the one still image (guide 3.3, rule 3).
  it("returns null when the device has no WebGL2", () => {
    const canvas = {
      getContext: () => null,
      clientWidth: 800,
      clientHeight: 400,
    } as unknown as HTMLCanvasElement;
    expect(createField(canvas, { ink: [0, 0, 0] })).toBeNull();
  });

  it("returns null when a shader will not compile", () => {
    const gl = {
      VERTEX_SHADER: 1,
      FRAGMENT_SHADER: 2,
      COMPILE_STATUS: 3,
      createShader: () => ({}),
      shaderSource: () => undefined,
      compileShader: () => undefined,
      getShaderParameter: () => false,
      deleteShader: () => undefined,
    };
    const canvas = {
      getContext: () => gl,
      clientWidth: 800,
      clientHeight: 400,
    } as unknown as HTMLCanvasElement;
    expect(createField(canvas, { ink: [0, 0, 0] })).toBeNull();
  });

  it("returns null when the shader cannot even be created", () => {
    const gl = {
      VERTEX_SHADER: 1,
      FRAGMENT_SHADER: 2,
      COMPILE_STATUS: 3,
      createShader: () => null,
    };
    const canvas = {
      getContext: () => gl,
      clientWidth: 800,
      clientHeight: 400,
    } as unknown as HTMLCanvasElement;
    expect(createField(canvas, { ink: [0, 0, 0] })).toBeNull();
  });
});
