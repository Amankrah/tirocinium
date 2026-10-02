// How ink is drawn (decision 0096). Separate from the model in `pen-ink.ts`
// and from the component, because the drawing rules are the part a reader
// doubts and a browser test cannot cheaply check: that the width follows the
// pressure along a line, that the curve passes through the samples rather than
// cornering at each one, and that redrawing is proportional to what is new
// rather than to everything already on the page.
import { strokeWidths, type InkPoint, type InkStroke } from "./pen-ink";

export const INK = "#161a23";
// The sheet, and therefore what the eraser puts back. The exported page stays
// ink on white, so a rubbed-out symbol leaves no grey for the reader to guess.
export const PAPER = "#ffffff";

/** The slice of the canvas context the pad draws through. */
export type InkContext = {
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  fillStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void;
  lineTo(x: number, y: number): void;
  stroke(): void;
  arc(x: number, y: number, r: number, from: number, to: number): void;
  fill(): void;
  fillRect(x: number, y: number, w: number, h: number): void;
};

function midpoint(a: InkPoint, b: InkPoint) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * One segment, at the width the pressure asked for there.
 *
 * Segment by segment because the width changes along the line: a single path
 * carries one lineWidth, so a whole-stroke path can only ever be the average,
 * which is the pressure being read and then thrown away.
 *
 * Each segment runs from the midpoint before the sample to the midpoint after
 * it, with the sample as the control point. That is what makes a curve pass
 * smoothly through a sampled path; joining samples directly turns a corner at
 * every one, and a hand moving quickly samples sparsely, so those corners land
 * exactly where the line is most visible.
 */
function paintSegment(
  g: InkContext,
  stroke: InkStroke,
  widths: number[],
  index: number,
) {
  const points = stroke.points;
  const previous = points[index - 1];
  const current = points[index];
  const next = points[index + 1];
  if (!current || !next) return;

  const start = previous ? midpoint(previous, current) : current;
  // The last segment ends on the sample itself, so the line reaches where the
  // pen was lifted rather than stopping half a sample short.
  const end = index === points.length - 2 ? next : midpoint(current, next);

  g.lineCap = "round";
  g.lineJoin = "round";
  g.strokeStyle = stroke.tool === "eraser" ? PAPER : INK;
  g.lineWidth = ((widths[index] ?? 1) + (widths[index + 1] ?? 1)) / 2;
  g.beginPath();
  g.moveTo(start.x, start.y);
  g.quadraticCurveTo(current.x, current.y, end.x, end.y);
  g.stroke();
}

/** A stroke that never moved: a full stop, or the dot over an i. */
function paintDab(g: InkContext, stroke: InkStroke, widths: number[]) {
  const only = stroke.points[0];
  if (!only) return;
  g.fillStyle = stroke.tool === "eraser" ? PAPER : INK;
  g.beginPath();
  g.arc(only.x, only.y, (widths[0] ?? 1) / 2, 0, Math.PI * 2);
  g.fill();
}

/**
 * Draw a stroke from `from` onwards. While a stroke is in progress the pad
 * passes the index it has already drawn, so the work per pointer event is the
 * length of what just arrived rather than the length of the page.
 */
export function paintStroke(g: InkContext, stroke: InkStroke, from = 0) {
  const widths = strokeWidths(stroke);
  if (stroke.points.length === 1) {
    if (from === 0) paintDab(g, stroke, widths);
    return;
  }
  for (let i = from; i < stroke.points.length - 1; i++) {
    paintSegment(g, stroke, widths, i);
  }
}

/** The whole sheet from blank. For undo, redo, clear, and a cancelled stroke. */
export function paintSheet(
  g: InkContext,
  strokes: InkStroke[],
  size: { width: number; height: number },
) {
  g.fillStyle = PAPER;
  g.fillRect(0, 0, size.width, size.height);
  for (const stroke of strokes) paintStroke(g, stroke);
}
