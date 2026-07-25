import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { boxFromDrag, PageBoxes, type Box } from "./page-boxes";

describe("boxFromDrag", () => {
  function expectBox(actual: number[], expected: number[]) {
    expected.forEach((v, i) => expect(actual[i]).toBeCloseTo(v, 6));
  }

  it("normalises two corners into x,y,w,h regardless of drag direction", () => {
    expectBox(boxFromDrag([0.2, 0.3], [0.5, 0.7]), [0.2, 0.3, 0.3, 0.4]);
    // Dragging up-left gives the same box as down-right.
    expectBox(boxFromDrag([0.5, 0.7], [0.2, 0.3]), [0.2, 0.3, 0.3, 0.4]);
  });

  it("clamps to the page", () => {
    const [x, y, w, h] = boxFromDrag([-0.5, -0.5], [1.5, 0.5]);
    expect(x).toBe(0);
    expect(y).toBe(0);
    expect(w).toBe(1);
    expect(h).toBe(0.5);
  });
});

describe("PageBoxes", () => {
  const boxes: Box[] = [
    { figureId: 1, bbox: [0.1, 0.1, 0.2, 0.2], role: "essential" },
    { figureId: 2, bbox: [0.5, 0.5, 0.2, 0.2], role: "decorative" },
  ];

  it("renders a box per figure", () => {
    render(
      <PageBoxes
        imageUrl="blob:page"
        boxes={boxes}
        selectedId={null}
        label="Source page 1"
        onSelect={vi.fn()}
        onDraw={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Figure 1" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Figure 2" })).toBeDefined();
  });

  it("selects a figure on click", () => {
    const onSelect = vi.fn();
    render(
      <PageBoxes
        imageUrl="blob:page"
        boxes={boxes}
        selectedId={null}
        label="Source page 1"
        onSelect={onSelect}
        onDraw={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Figure 2" }));
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it("marks the selected figure pressed", () => {
    render(
      <PageBoxes
        imageUrl="blob:page"
        boxes={boxes}
        selectedId={1}
        label="Source page 1"
        onSelect={vi.fn()}
        onDraw={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Figure 1" }).getAttribute("aria-pressed"),
    ).toBe("true");
  });
});
