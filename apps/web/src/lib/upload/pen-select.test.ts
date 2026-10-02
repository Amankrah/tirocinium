import { describe, expect, it } from "vitest";

import type { InkStroke } from "./pen-ink";
import {
  pointInPolygon,
  selectionBounds,
  strokesInLasso,
  withinBounds,
} from "./pen-select";

const at = (x: number, y: number) => ({ x, y, pressure: 0.5 });
const square = [at(0, 0), at(100, 0), at(100, 100), at(0, 100)];
const stroke = (points: [number, number][]): InkStroke => ({
  tool: "pen",
  width: 3,
  points: points.map(([x, y]) => at(x, y)),
});

describe("pointInPolygon", () => {
  it("knows inside from outside", () => {
    expect(pointInPolygon(at(50, 50), square)).toBe(true);
    expect(pointInPolygon(at(150, 50), square)).toBe(false);
  });

  // Nobody closes a lasso exactly, so the loop is treated as closed from the
  // last point back to the first.
  it("closes a loop the hand left open", () => {
    const open = [at(0, 0), at(100, 0), at(100, 100), at(10, 100)];
    expect(pointInPolygon(at(50, 50), open)).toBe(true);
  });
});

describe("strokesInLasso", () => {
  it("takes a stroke that is inside and leaves one that is not", () => {
    const strokes = [stroke([[10, 10], [20, 20]]), stroke([[500, 500], [510, 510]])];
    expect(strokesInLasso(strokes, square)).toEqual(new Set([0]));
  });

  // Catching a stroke by one stray sample means a loop drawn round one line of
  // working also drags the descender from the line above it.
  it("ignores a stroke that only clips the loop", () => {
    const clipping = stroke([[95, 95], [300, 300], [400, 400], [500, 500]]);
    expect(strokesInLasso([clipping], square).size).toBe(0);
  });

  it("needs a loop, not a line", () => {
    expect(strokesInLasso([stroke([[10, 10]])], [at(0, 0), at(10, 10)]).size).toBe(0);
  });
});

describe("selectionBounds", () => {
  it("boxes what is held, and is null when nothing is", () => {
    const strokes = [stroke([[10, 20], [30, 40]])];
    expect(selectionBounds(strokes, new Set([0]))).toEqual({
      minX: 10,
      minY: 20,
      maxX: 30,
      maxY: 40,
    });
    expect(selectionBounds(strokes, new Set())).toBeNull();
  });

  it("lets a drag start just outside the box, where a finger lands", () => {
    const bounds = { minX: 10, minY: 10, maxX: 20, maxY: 20 };
    expect(withinBounds(at(5, 15), bounds)).toBe(true);
    expect(withinBounds(at(80, 15), bounds)).toBe(false);
  });
});
