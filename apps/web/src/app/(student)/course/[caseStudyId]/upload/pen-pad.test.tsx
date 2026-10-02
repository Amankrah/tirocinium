import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PenPad } from "./pen-pad";

// The drawing and PNG export are canvas APIs jsdom does not implement, so they
// are exercised in a real browser (the mode-C journey); here we pin the surface
// contract: the labelled canvas and controls that gate on having drawn.
describe("PenPad", () => {
  it("renders the labelled canvas with the controls disabled before any ink", () => {
    render(<PenPad onCapture={vi.fn()} />);
    const space = screen.getByRole("region", { name: "Handwriting space" });
    // Both axes: a page magnified to write a subscript is wider than the box.
    expect(space.className).toContain("overflow-auto");
    expect(space.contains(screen.getByRole("img", { name: "Handwriting page" }))).toBe(
      true,
    );
    expect(
      screen.getByRole("button", { name: "Add this page" }).hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen.getByRole("button", { name: "Clear" }).hasAttribute("disabled"),
    ).toBe(true);
    expect(screen.getByRole("button", { name: "Pen" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(screen.getByRole("button", { name: "Eraser" })).toBeDefined();
    expect(screen.getByRole("radio", { name: "Medium" }).getAttribute("aria-checked")).toBe(
      "true",
    );
    expect(screen.getByRole("button", { name: "Undo" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Redo" }).hasAttribute("disabled")).toBe(true);
  });

  it("offers the five tools, with the pen chosen", () => {
    render(<PenPad onCapture={vi.fn()} />);
    for (const name of ["Pen", "Highlighter", "Straight line", "Eraser", "Select"]) {
      expect(screen.getByRole("button", { name })).toBeDefined();
    }
    expect(screen.getByRole("button", { name: "Pen" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("starts at 1x and cannot zoom out below it", () => {
    render(<PenPad onCapture={vi.fn()} />);
    expect(screen.getByText("1x")).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Zoom out" }).hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen.getByRole("button", { name: "Zoom in" }).hasAttribute("disabled"),
    ).toBe(false);
  });

  // The lasso is the one tool here nobody has met before, so it says what it
  // wants rather than waiting to be guessed at.
  it("explains the lasso only when the lasso is chosen", () => {
    render(<PenPad onCapture={vi.fn()} />);
    const hint = "Circle some working to move it, or delete it.";
    expect(screen.queryByText(hint)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Select" }));
    expect(screen.getByText(hint)).toBeDefined();
  });

  it("offers no delete until something is held", () => {
    render(<PenPad onCapture={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Select" }));
    expect(screen.queryByRole("button", { name: "Delete selection" })).toBeNull();
  });
});