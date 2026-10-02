import { describe, expect, it } from "vitest";

import { PEN_WIDTH, type InkStroke } from "./pen-ink";
import {
  HIGHLIGHT,
  INK,
  PAPER,
  paintSelection,
  paintSheet,
  paintStroke,
  type InkContext,
} from "./pen-render";

// A context that records what it was asked to draw. The pad's drawing rules
// were previously only observable by looking at a real browser, which meant
// the claims about them (width follows pressure, the curve passes through the
// samples, redrawing is proportional to what is new) were untested.
type Call = { op: string; args: number[]; width: number; colour: string };

function recorder(): InkContext & { calls: Call[] } {
  const calls: Call[] = [];
  const g = {
    calls,
    lineCap: "butt" as CanvasLineCap,
    lineJoin: "miter" as CanvasLineJoin,
    strokeStyle: "" as string,
    fillStyle: "" as string,
    lineWidth: 0,
    beginPath: () => {},
    moveTo: (x: number, y: number) => push("moveTo", [x, y]),
    quadraticCurveTo: (cx: number, cy: number, x: number, y: number) =>
      push("quadraticCurveTo", [cx, cy, x, y]),
    lineTo: (x: number, y: number) => push("lineTo", [x, y]),
    stroke: () => push("stroke", []),
    arc: (x: number, y: number, r: number) => push("arc", [x, y, r]),
    fill: () => push("fill", []),
    fillRect: (x: number, y: number, w: number, h: number) =>
      push("fillRect", [x, y, w, h]),
    setLineDash: (pattern: number[]) => push("setLineDash", pattern),
    strokeRect: (x: number, y: number, w: number, h: number) =>
      push("strokeRect", [x, y, w, h]),
  };
  function push(op: string, args: number[]) {
    calls.push({ op, args, width: g.lineWidth, colour: String(g.strokeStyle || g.fillStyle) });
  }
  return g;
}

const line = (pressures: number[], tool: InkStroke["tool"] = "pen"): InkStroke => ({
  tool,
  width: PEN_WIDTH.medium,
  points: pressures.map((pressure, i) => ({ x: i * 10, y: i * 10, pressure })),
});

describe("paintStroke", () => {
  it("draws one segment per gap between samples", () => {
    const g = recorder();
    paintStroke(g, line([0.5, 0.5, 0.5, 0.5]));
    expect(g.calls.filter((c) => c.op === "stroke")).toHaveLength(3);
  });

  // The whole point of reading pressure. A single path can carry one width,
  // so a stroke drawn as one path can only be its own average.
  it("changes the width along a single stroke as the pressure changes", () => {
    const g = recorder();
    paintStroke(g, line([0.1, 0.4, 0.8, 1]));
    const widths = g.calls.filter((c) => c.op === "stroke").map((c) => c.width);
    expect(widths[widths.length - 1]!).toBeGreaterThan(widths[0]!);
  });

  // Joining samples directly corners at every one, and a fast hand samples
  // sparsely, so those corners land where the line is most visible.
  it("curves through the samples rather than cornering at them", () => {
    const g = recorder();
    paintStroke(g, line([0.5, 0.5, 0.5]));
    expect(g.calls.some((c) => c.op === "quadraticCurveTo")).toBe(true);
    expect(g.calls.some((c) => c.op === "lineTo")).toBe(false);
  });

  it("ends the last segment on the sample, where the pen was lifted", () => {
    const g = recorder();
    const stroke = line([0.5, 0.5, 0.5]);
    paintStroke(g, stroke);
    const last = g.calls.filter((c) => c.op === "quadraticCurveTo").at(-1)!;
    const tip = stroke.points.at(-1)!;
    expect(last.args.slice(2)).toEqual([tip.x, tip.y]);
  });

  // The pad passes the index it has already drawn, so the work per pointer
  // event is the length of what just arrived, not the length of the page.
  it("draws only from the point asked for", () => {
    const whole = recorder();
    const tail = recorder();
    const stroke = line([0.5, 0.5, 0.5, 0.5, 0.5]);
    paintStroke(whole, stroke);
    paintStroke(tail, stroke, 3);
    expect(tail.calls.filter((c) => c.op === "stroke")).toHaveLength(1);
    expect(whole.calls.filter((c) => c.op === "stroke")).toHaveLength(4);
  });

  it("puts down a dab for a stroke that never moved", () => {
    const g = recorder();
    paintStroke(g, { tool: "pen", width: 4, points: [{ x: 5, y: 6, pressure: 0.5 }] });
    expect(g.calls.map((c) => c.op)).toEqual(["arc", "fill"]);
  });

  // The exported page stays ink on white: an erased symbol leaves nothing for
  // the reader to guess at, rather than a grey smear.
  it("erases in the colour of the sheet", () => {
    const g = recorder();
    paintStroke(g, line([0.5, 0.5], "eraser"));
    expect(g.calls.find((c) => c.op === "stroke")!.colour).toBe(PAPER);
    const pen = recorder();
    paintStroke(pen, line([0.5, 0.5]));
    expect(pen.calls.find((c) => c.op === "stroke")!.colour).toBe(INK);
  });
});

describe("paintSheet", () => {
  it("starts from a blank sheet, so an undone stroke is gone", () => {
    const g = recorder();
    paintSheet(g, [line([0.5, 0.5])], { width: 1000, height: 1414 });
    const first = g.calls[0]!;
    expect(first.op).toBe("fillRect");
    expect(first.args).toEqual([0, 0, 1000, 1414]);
    expect(first.colour).toBe(PAPER);
  });
});

describe("the highlighter", () => {
  // A student highlights a line after writing it, so in stroke order the band
  // would land on top and dim the reading. The page is read back by a
  // transcriber: emphasis bought with legibility is a bad trade.
  it("goes under the writing however late it was drawn", () => {
    const g = recorder();
    const pen: InkStroke = { ...line([0.5, 0.5]), tool: "pen" };
    const band: InkStroke = { ...line([0.5, 0.5]), tool: "highlighter" };
    paintSheet(g, [pen, band], { width: 1000, height: 1414 });

    const colours = g.calls.filter((c) => c.op === "stroke").map((c) => c.colour);
    expect(colours[0]).toBe(HIGHLIGHT);
    expect(colours[1]).toBe(INK);
  });

  it("is translucent, so the ink still reads through it", () => {
    expect(HIGHLIGHT).toMatch(/rgba\(/);
  });
});

describe("the selection marks", () => {
  it("boxes the selection with a dashed outline and puts the dash back", () => {
    const g = recorder();
    paintSelection(g, { minX: 10, minY: 20, maxX: 110, maxY: 60 });
    expect(g.calls.some((c) => c.op === "strokeRect")).toBe(true);
    expect(g.calls.at(-1)!.op).toBe("setLineDash");
    expect(g.calls.at(-1)!.args).toEqual([]);
  });

  it("draws nothing when nothing is held", () => {
    const g = recorder();
    paintSelection(g, null);
    expect(g.calls).toHaveLength(0);
  });
});
