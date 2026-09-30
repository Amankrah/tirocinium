// Keeping the pen in view while a student writes (decision 0082).
//
// The handwriting sheet is taller than the space it is shown in, so the pad
// scrolls (decision 0080). On its own that means writing stops at the fold:
// you reach the bottom edge of the window, lift the pen, scroll, and pick the
// sentence back up. Nobody writes that way on paper, and the pad is meant to
// feel like paper.
//
// So the window follows the pen. This is the whole rule, kept pure so it can
// be reasoned about without a canvas: given where the pen is inside the
// window, say where the window should be scrolled to.

/** How close to an edge the pen gets before the window starts moving. */
export const FOLLOW_MARGIN = 96;

export type FollowInput = {
  /** Pen position measured from the top of the scrolling window, in CSS px. */
  pointerY: number;
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
  margin?: number;
};

/**
 * The scrollTop the window should have so the pen stays clear of both edges.
 *
 * Returns the current scrollTop unchanged when the pen is comfortably inside,
 * so a caller can compare and avoid touching the DOM on most pointer moves.
 * The result is always clamped to what the window can actually scroll, which
 * is what makes the bottom of the sheet behave like the bottom of a page: the
 * pen keeps going, the paper does not.
 */
export function followPen({
  pointerY,
  scrollTop,
  clientHeight,
  scrollHeight,
  margin = FOLLOW_MARGIN,
}: FollowInput): number {
  const maxScroll = Math.max(0, scrollHeight - clientHeight);
  // A window shorter than twice the margin has no comfortable middle, so
  // centring on the pen is the honest reading of "keep it in view".
  const safe = clientHeight < margin * 2 ? clientHeight / 2 : margin;

  let next = scrollTop;
  const fromBottom = clientHeight - pointerY;
  if (fromBottom < safe) next = scrollTop + (safe - fromBottom);
  else if (pointerY < safe) next = scrollTop - (safe - pointerY);

  return Math.min(maxScroll, Math.max(0, next));
}
