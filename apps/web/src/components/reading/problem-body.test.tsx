import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProblemBody } from "./problem-body";

// Guide 2 and constraint 2: the body typesets markdown and math, and figures
// render exactly as extracted, at their token position, at stored intrinsic
// dimensions, never omitted or substituted.
describe("ProblemBody", () => {
  it("renders markdown headings nested beneath the page title (h1 to h2)", () => {
    render(<ProblemBody body={"# The setup\n\nSome **bold** reasoning."} />);
    // The page owns the single h1; a body "# ..." becomes an h2.
    expect(screen.getByRole("heading", { level: 2, name: "The setup" })).toBeDefined();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
  });

  it("typesets math via KaTeX on the server", () => {
    const { container } = render(
      <ProblemBody body={"Euler said $e^{i\\pi} + 1 = 0$."} />,
    );
    expect(container.querySelector(".katex")).not.toBeNull();
  });

  it("resolves a fig:// token to an image at its stored dimensions", () => {
    render(
      <ProblemBody
        body={"![Bridge circuit](fig://c1)"}
        figures={{ c1: { src: "/figures/c1.png", width: 640, height: 480 } }}
      />,
    );
    const img = screen.getByAltText("Bridge circuit");
    expect(img.getAttribute("width")).toBe("640");
    expect(img.getAttribute("height")).toBe("480");
  });

  it("shows an honest marker when a figure token cannot be resolved", () => {
    render(<ProblemBody body={"![Missing diagram](fig://nope)"} />);
    expect(screen.getByText("Figure unavailable")).toBeDefined();
  });
});
