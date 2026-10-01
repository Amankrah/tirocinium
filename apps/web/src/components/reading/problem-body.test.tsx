import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ClientProblemBody } from "./client-problem-body";
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

  it("breaks a display chain into lines instead of printing the TeX", () => {
    const { container } = render(
      <ProblemBody
        body={[
          "The cell volume is",
          "",
          "$$V_C = a^3 = \\frac{64R^3}{3\\sqrt{3}}$$",
          "",
          "The density of a crystal is",
        ].join("\n")}
      />,
    );
    const visible = container.querySelector(".katex-html")?.textContent ?? "";
    const ann = container.querySelector("annotation")?.textContent ?? "";
    expect(container.querySelector(".katex-error")).toBeNull();
    expect(visible).not.toContain("aligned");
    expect(ann).toContain("\\begin{aligned}");
    expect(container.querySelector(".mtable")).not.toBeNull();
  });

  it("typesets math via KaTeX on the server", () => {
    const { container } = render(
      <ProblemBody body={"Euler said $e^{i\\pi} + 1 = 0$."} />,
    );
    expect(container.querySelector(".katex")).not.toBeNull();
  });

  it("keeps the subscript on atomic mass and Avogadro's number", () => {
    const { container } = render(
      <ProblemBody
        body={[
          "- Atomic mass $A_{\\mathrm{V}} = 50.94\\ \\mathrm{g/mol}$",
          "- Atomic mass $A_{\\mathrm{Nb}} = 92.91\\ \\mathrm{g/mol}$",
          "- Avogadro's number $N_A = 6.023\\times10^{23}\\ \\mathrm{atoms/mol}$",
          "where $V_C$ is the cell volume",
        ].join("\n")}
      />,
    );
    expect(container.querySelector(".katex-error")).toBeNull();
    const scripts = [...container.querySelectorAll("sub")].map(
      (node) => node.textContent ?? "",
    );
    expect(scripts).toContain("V");
    expect(scripts).toContain("Nb");
    expect(scripts).toContain("A");
    expect(scripts).toContain("C");
    const tex = [...container.querySelectorAll("annotation")]
      .map((node) => node.textContent ?? "")
      .join(" ");
    expect(tex).toContain("A_{\\mathrm{V}}");
    expect(tex).toMatch(/N_A/);
  });

  it("keeps a power as a superscript, not a dropped letter", () => {
    const { container } = render(<ProblemBody body={"The edge is $a^3$."} />);
    expect(container.querySelector(".katex-error")).toBeNull();
    expect(container.querySelector("sup")?.textContent).toBe("3");
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

  // decision 0078: a materials course states its data in tables, and without
  // GFM a table renders as a run of pipe characters rather than failing
  // visibly, which is the worst kind of wrong.
  const TABLE = [
    "| Element | Radius (nm) | Structure |",
    "| --- | --- | --- |",
    "| Cu | 0.1278 | FCC |",
    "| Ni | 0.1246 | FCC |",
  ].join("\n");

  it("renders a GFM table as a real table", () => {
    render(<ProblemBody body={TABLE} />);
    expect(screen.getByRole("table")).toBeDefined();
    expect(screen.getByRole("columnheader", { name: "Element" })).toBeDefined();
    expect(screen.getAllByRole("row")).toHaveLength(3);
    expect(screen.getByRole("cell", { name: "0.1278" })).toBeDefined();
  });

  it("renders a table identically in the client twin", () => {
    // The twin shows the same professor's markdown after a practice swap, so a
    // plugin on one side and not the other reads as a table that reformats
    // itself mid-session (the server/client drift of decision 0068).
    const server = render(<ProblemBody body={TABLE} />);
    const serverRows = server.container.querySelectorAll("tr").length;
    server.unmount();
    const client = render(<ClientProblemBody body={TABLE} />);
    expect(client.container.querySelectorAll("tr").length).toBe(serverRows);
  });

  it("still sanitises a dangerous URL now that GFM autolinks are on", () => {
    // GFM turns bare URLs into links, and a body can carry transcribed student
    // text, so the default sanitizer must still be the one deciding.
    const { container } = render(
      <ProblemBody body={"[click](javascript:alert(1))"} />,
    );
    const href = container.querySelector("a")?.getAttribute("href") ?? "";
    expect(href).not.toContain("javascript:");
  });
});
