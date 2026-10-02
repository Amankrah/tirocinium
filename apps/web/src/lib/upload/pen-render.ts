// How ink is drawn (decisions 0096, 0097). Separate from the model in `pen-ink.ts`
// and from the component, because the drawing rules are the part a reader
// doubts and a browser test cannot cheaply check: that the width follows the
// pressure along a line, that the curve passes through the samples rather than
// cornering at each one, and that redrawing is proportional to what is new
// rather than to everything already on the page.
import { strokeWidths, type InkPoint, type InkStroke } from "./pen-ink";
import type { Bounds } from "./pen-select";

export const INK = "#161a23";
// The sheet, and therefore what the eraser puts back. The exported page stays
// ink on white, so a rubbed-out symbol leaves no grey for the reader to guess.
export const PAPER = "#ffffff";
// The highlighter. Translucent, and laid down before the writing, so a band
// never dims the ink: the page is read back by a transcriber, and emphasis
// bought with legibility is a bad trade on a page being marked.
export const HIGHLIGHT = "rgba(246, 198, 62, 0.45)";
// The selection outline. Drawn on the live canvas only and never exported.
export const SELECTION = "rgba(59, 91, 219, 0.9)";

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
  setLineDash(pattern: number[]): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
};

function colourOf(stroke: InkStroke): string {
  if (stroke.tool === "eraser") return PAPER;
  if (stroke.tool === "highlighter") return HIGHLIGHT;
  return INK;
}

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
  g.strokeStyle = colourOf(stroke);
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
  g.fillStyle = colourOf(stroke);
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

/**
 * The whole sheet from blank. For undo, redo, clear, a cancelled stroke, and
 * anything that moves what is already down.
 *
 * Highlighter first, whatever order it was drawn in. A student highlights a
 * line after writing it, so in stroke order the band would land on top of the
 * reading and dim it. Laying every band down first keeps the page ink over
 * colour, which is the way round a marker works on paper.
 */
export function paintSheet(
  g: InkContext,
  strokes: InkStroke[],
  size: { width: number; height: number },
) {
  g.fillStyle = PAPER;
  g.fillRect(0, 0, size.width, size.height);
  for (const stroke of strokes) {
    if (stroke.tool === "highlighter") paintStroke(g, stroke);
  }
  for (const stroke of strokes) {
    if (stroke.tool !== "highlighter") paintStroke(g, stroke);
  }
}

/**
 * The box round what the lasso is holding. Painted after the sheet and never
 * exported: it is the pad telling the student what a drag or a delete would
 * take, not a mark they made.
 */
export function paintSelection(g: InkContext, bounds: Bounds | null) {
  if (!bounds) return;
  g.setLineDash([8, 6]);
  g.strokeStyle = SELECTION;
  g.lineWidth = 2;
  g.strokeRect(
    bounds.minX - 8,
    bounds.minY - 8,
    bounds.maxX - bounds.minX + 16,
    bounds.maxY - bounds.minY + 16,
  );
  g.setLineDash([]);
}

/** The loop itself, while the student is still drawing it. */
export function paintLasso(g: InkContext, polygon: InkPoint[]) {
  const first = polygon[0];
  if (!first || polygon.length < 2) return;
  g.setLineDash([6, 5]);
  g.strokeStyle = SELECTION;
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(first.x, first.y);
  for (const point of polygon.slice(1)) g.lineTo(point.x, point.y);
  g.stroke();
  g.setLineDash([]);
}
