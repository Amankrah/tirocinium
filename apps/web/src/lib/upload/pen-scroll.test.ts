import { describe, expect, it } from "vitest";

import { FOLLOW_MARGIN, followPen } from "./pen-scroll";

// decision 0082: the window follows the pen so writing does not stop at the
// fold. The arithmetic is the whole behaviour, so it is pinned here; the
// stroke itself is a canvas API and is exercised in the mode-C journey.
describe("followPen", () => {
  const base = { scrollTop: 0, clientHeight: 512, scrollHeight: 1414 };

  it("leaves the window alone while the pen is in the comfortable middle", () => {
    expect(followPen({ ...base, pointerY: 256 })).toBe(0);
  });

  it("scrolls down as the pen nears the bottom edge", () => {
    // 20 px from the bottom, so the window moves the shortfall to the margin.
    const next = followPen({ ...base, pointerY: 492 });
    expect(next).toBe(FOLLOW_MARGIN - 20);
    expect(next).toBeGreaterThan(0);
  });

  it("scrolls up as the pen nears the top edge", () => {
    expect(followPen({ ...base, scrollTop: 400, pointerY: 16 })).toBe(
      400 - (FOLLOW_MARGIN - 16),
    );
  });

  it("stops at the bottom of the sheet rather than inventing paper", () => {
    // Already scrolled to the end: the pen may keep going, the page may not.
    const maxScroll = base.scrollHeight - base.clientHeight;
    expect(
      followPen({ ...base, scrollTop: maxScroll, pointerY: 511 }),
    ).toBe(maxScroll);
  });

  it("never scrolls above the top of the sheet", () => {
    expect(followPen({ ...base, scrollTop: 0, pointerY: 0 })).toBe(0);
  });

  it("centres on the pen when the window is too short to have a middle", () => {
    // A cramped viewport: both edges are inside one margin of each other, so
    // the rule degenerates to keeping the pen centred rather than oscillating.
    const next = followPen({
      pointerY: 100,
      scrollTop: 200,
      clientHeight: 120,
      scrollHeight: 1414,
      margin: FOLLOW_MARGIN,
    });
    expect(next).toBe(200 + (60 - 20));
  });

  it("does not move when there is nothing to scroll", () => {
    expect(
      followPen({ pointerY: 500, scrollTop: 0, clientHeight: 512, scrollHeight: 512 }),
    ).toBe(0);
  });
});
