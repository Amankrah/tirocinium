import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PenPad } from "./pen-pad";

// The drawing and PNG export are canvas APIs jsdom does not implement, so they
// are exercised in a real browser (the mode-C journey); here we pin the surface
// contract: the labelled canvas and controls that gate on having drawn.
describe("PenPad", () => {
  it("renders the labelled canvas with the controls disabled before any ink", () => {
    render(<PenPad onCapture={vi.fn()} />);
    expect(screen.getByRole("img", { name: "Handwriting page" })).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Add this page" }).hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen.getByRole("button", { name: "Clear" }).hasAttribute("disabled"),
    ).toBe(true);
  });
});
