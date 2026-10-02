// The handwriting pad's ink (decision 0096). Strokes, not pixels: a mistake
// can be undone, and the eraser rubs out part of a line without leaving a grey
// smear for the marker to read. Kept pure so the rules can be tested without
// a canvas.

export type InkPoint = { x: number; y: number; pressure: number };

export type InkTool = "pen" | "eraser";

export type InkStroke = {
  tool: InkTool;
  /** Base width in canvas pixels, before pressure. */
  width: number;
  points: InkPoint[];
};

export type InkHistory = {
  strokes: InkStroke[];
  past: InkStroke[][];
  future: InkStroke[][];
};

export const EMPTY_INK: InkHistory = { strokes: [], past: [], future: [] };

/** Canvas-pixel widths. The exported page is 1000 px across. */
export const PEN_WIDTH = { fine: 2, medium: 3.5, broad: 6.5 } as const;

export type PenWeight = keyof typeof PEN_WIDTH;

/** Wider than a letter, narrower than a word, so a rubber lifts a symbol. */
export const ERASER_WIDTH = 28;

const HISTORY_LIMIT = 40;

/** A resting palm is a wide touch. A fingertip is not. Zero means unknown. */
const PALM_SPAN = 40;

export function hasPenInk(strokes: InkStroke[]): boolean {
  return strokes.some((stroke) => stroke.tool === "pen" && stroke.points.length > 0);
}

export function pushInk(history: InkHistory, stroke: InkStroke): InkHistory {
  if (stroke.points.length === 0) return history;
  const past = [...history.past, history.strokes].slice(-HISTORY_LIMIT);
  return { strokes: [...history.strokes, stroke], past, future: [] };
}

export function undoInk(history: InkHistory): InkHistory {
  const previous = history.past.at(-1);
  if (!previous) return history;
  return {
    strokes: previous,
    past: history.past.slice(0, -1),
    future: [history.strokes, ...history.future],
  };
}

export function redoInk(history: InkHistory): InkHistory {
  const next = history.future[0];
  if (!next) return history;
  return {
    strokes: next,
    past: [...history.past, history.strokes],
    future: history.future.slice(1),
  };
}

export function clearInk(history: InkHistory): InkHistory {
  if (history.strokes.length === 0) return history;
  return {
    strokes: [],
    past: [...history.past, history.strokes].slice(-HISTORY_LIMIT),
    future: [],
  };
}

/**
 * A touch while a stylus is down is a palm on the screen. A touch whose
 * contact is palm-sized is the same thing. Everything else may write.
 */
export function rejectPointer(input: {
  pointerType: string;
  width: number;
  height: number;
  penDown: boolean;
}): boolean {
  if (input.pointerType === "touch" && input.penDown) return true;
  const span = Math.max(input.width, input.height);
  return input.pointerType === "touch" && span >= PALM_SPAN;
}

/** Pointer Events: button 5, bitmask 32, is the stylus eraser tip. */
export function wantsEraserTip(button: number, buttons: number): boolean {
  return button === 5 || (buttons & 32) !== 0;
}

/** Mouse and some pens report 0. Treat that as a mid-pressure stroke. */
export function strokeWidth(base: number, pressure: number): number {
  const p = pressure > 0 && pressure <= 1 ? pressure : 0.5;
  return base * (0.45 + p);
}

/**
 * How much of each new pressure reading to believe. Digitisers report pressure
 * in coarse steps, and using them raw draws a staircase: the line jumps a
 * width mid-letter where the hand did nothing. An exponential moving average
 * turns the steps into a taper, which is what the hand actually did.
 */
const PRESSURE_SMOOTHING = 0.3;

/**
 * The width of the line at each point of a stroke.
 *
 * One width per point rather than one per stroke. Averaging pressure over a
 * whole stroke, which is what this used to do, makes a downstroke and its
 * hairline exit the same weight: the pressure is read, and then thrown away
 * before it can be seen. A letter gets its character from the width changing
 * inside it.
 *
 * The eraser is deliberately constant. A rubber that bit harder when pressed
 * would take neighbouring symbols with it.
 */
export function strokeWidths(stroke: InkStroke): number[] {
  if (stroke.tool === "eraser") return stroke.points.map(() => stroke.width);
  const first = stroke.points[0];
  if (!first) return [];
  let smoothed = first.pressure > 0 && first.pressure <= 1 ? first.pressure : 0.5;
  return stroke.points.map((point, index) => {
    if (index > 0) {
      const raw = point.pressure > 0 && point.pressure <= 1 ? point.pressure : 0.5;
      smoothed = PRESSURE_SMOOTHING * raw + (1 - PRESSURE_SMOOTHING) * smoothed;
    }
    return strokeWidth(stroke.width, smoothed);
  });
}
