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

  // Constraint 2: the bytes a student sees are the bytes the professor's source
  // held. Next's own loader would re-encode them through /_next/image, so the
  // rendered URLs must be the backend's own (decision 0066).
  it("serves the backend's own bytes, never a re-encode through the optimizer", () => {
    render(
      <ProblemBody
        body={"![Bridge circuit](fig://c1)"}
        figures={{
          c1: {
            src: "https://storage.example/c1.png",
            src2x: "https://storage.example/c1@2x.png",
            width: 640,
            height: 480,
          },
        }}
      />,
    );
    const img = screen.getByAltText("Bridge circuit");
    expect(img.getAttribute("src")).toContain("https://storage.example/");
    expect(img.getAttribute("src")).not.toContain("/_next/image");
    expect(img.getAttribute("srcset") ?? "").not.toContain("/_next/image");
  });

  // Guide 2: the 2x rendition on high-density screens, and it is the rendition
  // the ingestion pipeline already made rather than one generated here.
  it("offers the backend's 2x rendition above the intrinsic width", () => {
    render(
      <ProblemBody
        body={"![Bridge circuit](fig://c1)"}
        figures={{
          c1: {
            src: "https://storage.example/c1.png",
            src2x: "https://storage.example/c1@2x.png",
            width: 640,
            height: 480,
          },
        }}
      />,
    );
    const srcset = screen.getByAltText("Bridge circuit").getAttribute("srcset") ?? "";
    expect(srcset).toContain("https://storage.example/c1.png 1x");
    expect(srcset).toContain("https://storage.example/c1@2x.png 2x");
  });

  it("falls back to the one rendition when there is no 2x", () => {
    render(
      <ProblemBody
        body={"![Bridge circuit](fig://c1)"}
        figures={{
          c1: { src: "https://storage.example/c1.png", src2x: null, width: 640, height: 480 },
        }}
      />,
    );
    const srcset = screen.getByAltText("Bridge circuit").getAttribute("srcset") ?? "";
    expect(srcset).toContain("https://storage.example/c1.png 2x");
  });

  it("shows an honest marker when a figure token cannot be resolved", () => {
    render(<ProblemBody body={"![Missing diagram](fig://nope)"} />);
    expect(screen.getByText("Figure unavailable")).toBeDefined();
  });
});
