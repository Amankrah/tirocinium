import { describe, expect, it } from "vitest";

import {
  clearInk,
  EMPTY_INK,
  hasPenInk,
  pushInk,
  redoInk,
  rejectPointer,
  strokeWidth,
  strokeWidths,
  undoInk,
  wantsEraserTip,
  type InkStroke,
  type MarkTool,
} from "./pen-ink";

const dot: InkStroke = {
  tool: "pen",
  width: 3.5,
  points: [{ x: 1, y: 1, pressure: 0.5 }],
};

describe("pen ink history", () => {
  it("undoes a stroke and redoes it", () => {
    const written = pushInk(EMPTY_INK, dot);
    expect(hasPenInk(written.strokes)).toBe(true);
    const undone = undoInk(written);
    expect(undone.strokes).toEqual([]);
    expect(redoInk(undone).strokes).toEqual([dot]);
  });

  it("drops the redo stack when a new stroke is written", () => {
    const undone = undoInk(pushInk(EMPTY_INK, dot));
    const again = pushInk(undone, { ...dot, width: 2 });
    expect(again.future).toEqual([]);
    expect(redoInk(again)).toBe(again);
  });

  it("clear is itself undoable", () => {
    const written = pushInk(EMPTY_INK, dot);
    const cleared = clearInk(written);
    expect(hasPenInk(cleared.strokes)).toBe(false);
    expect(undoInk(cleared).strokes).toEqual([dot]);
  });

  it("ignores an empty stroke", () => {
    expect(pushInk(EMPTY_INK, { tool: "pen", width: 3, points: [] })).toBe(EMPTY_INK);
  });
});

describe("the pad's pointer rules", () => {
  it("rejects a palm and a touch that lands while the stylus is down", () => {
    expect(
      rejectPointer({ pointerType: "touch", width: 80, height: 60, penDown: false }),
    ).toBe(true);
    expect(
      rejectPointer({ pointerType: "touch", width: 12, height: 12, penDown: true }),
    ).toBe(true);
    expect(
      rejectPointer({ pointerType: "touch", width: 12, height: 12, penDown: false }),
    ).toBe(false);
    expect(
      rejectPointer({ pointerType: "pen", width: 1, height: 1, penDown: false }),
    ).toBe(false);
  });

  it("treats the stylus eraser tip as an eraser", () => {
    expect(wantsEraserTip(5, 0)).toBe(true);
    expect(wantsEraserTip(0, 32)).toBe(true);
    expect(wantsEraserTip(0, 1)).toBe(false);
  });

  it("thickens a stroke with pressure and substitutes a mid weight when pressure is missing", () => {
    expect(strokeWidth(4, 1)).toBeGreaterThan(strokeWidth(4, 0.2));
    expect(strokeWidth(4, 0)).toBe(strokeWidth(4, 0.5));
  });
});

describe("strokeWidths", () => {
  const stroke = (pressures: number[], tool: MarkTool = "pen"): InkStroke => ({
    tool,
    width: 4,
    points: pressures.map((pressure, i) => ({ x: i, y: 0, pressure })),
  });

  // The old behaviour averaged pressure over the whole stroke, so a hard
  // downstroke and the hairline leaving it came out the same weight.
  it("varies the width inside a single stroke", () => {
    const widths = strokeWidths(stroke([0.2, 0.4, 0.7, 0.9]));
    expect(new Set(widths).size).toBe(widths.length);
    expect(widths[widths.length - 1]!).toBeGreaterThan(widths[0]!);
  });

  // Digitisers report pressure in steps; used raw they draw a staircase.
  it("smooths a step rather than following it in one jump", () => {
    const widths = strokeWidths(stroke([0.1, 1, 1, 1]));
    const jump = widths[1]! - widths[0]!;
    const full = strokeWidth(4, 1) - strokeWidth(4, 0.1);
    expect(jump).toBeGreaterThan(0);
    expect(jump).toBeLessThan(full / 2);
  });

  it("keeps the eraser at one width, so it cannot bite when pressed", () => {
    expect(strokeWidths(stroke([0.1, 0.9], "eraser"))).toEqual([4, 4]);
  });

  it("treats a missing pressure as mid pressure throughout", () => {
    expect(strokeWidths(stroke([0, 0]))).toEqual([strokeWidth(4, 0.5), strokeWidth(4, 0.5)]);
  });
});
