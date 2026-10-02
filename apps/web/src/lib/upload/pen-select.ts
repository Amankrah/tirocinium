// Choosing strokes with a lasso (decision 0097). Pure geometry, so the rule
// for what a loop caught can be tested without a canvas and without a hand.
import type { InkPoint, InkStroke } from "./pen-ink";

export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

/**
 * Ray casting: count the edges a ray to the right crosses. Odd is inside.
 * Handles a loop the student did not close, because nobody closes a lasso
 * exactly; the polygon is treated as closed from the last point to the first.
 */
export function pointInPolygon(point: InkPoint, polygon: InkPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (!a || !b) continue;
    const straddles = a.y > point.y !== b.y > point.y;
    if (!straddles) continue;
    const crossX = ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (point.x < crossX) inside = !inside;
  }
  return inside;
}

/**
 * The strokes a loop caught, by index.
 *
 * A stroke counts when most of it is inside, not when any of it is. Catching a
 * stroke by one stray sample means a lasso drawn around one line of working
 * also drags the descender of the line above it, which the student did not ask
 * for and will only notice after they have moved it.
 */
export const INSIDE_SHARE = 0.6;

export function strokesInLasso(
  strokes: InkStroke[],
  polygon: InkPoint[],
): Set<number> {
  const chosen = new Set<number>();
  if (polygon.length < 3) return chosen;
  strokes.forEach((stroke, index) => {
    if (stroke.points.length === 0) return;
    const inside = stroke.points.filter((point) => pointInPolygon(point, polygon)).length;
    if (inside / stroke.points.length >= INSIDE_SHARE) chosen.add(index);
  });
  return chosen;
}

/** The box around a selection, for drawing the outline that says what is held. */
export function selectionBounds(
  strokes: InkStroke[],
  chosen: ReadonlySet<number>,
): Bounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const index of chosen) {
    for (const point of strokes[index]?.points ?? []) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
  }
  if (minX === Infinity) return null;
  return { minX, minY, maxX, maxY };
}

/** Whether a point is inside the selection's box, so a drag picks it up. */
export function withinBounds(point: InkPoint, bounds: Bounds, slack = 12): boolean {
  return (
    point.x >= bounds.minX - slack &&
    point.x <= bounds.maxX + slack &&
    point.y >= bounds.minY - slack &&
    point.y <= bounds.maxY + slack
  );
}
