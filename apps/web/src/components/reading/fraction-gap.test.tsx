import { render } from "@testing-library/react";
import katex from "katex";
import { describe, expect, it } from "vitest";

import { ProblemBody } from "./problem-body";
import { openFractionDenominators } from "./fraction-gap";

type Node = {
  type: string;
  tagName: string;
  properties: { className?: string[]; style?: string };
  children: Node[];
};

function span(
  className: string[] | undefined,
  style: string | undefined,
  children: Node[] = [],
): Node {
  return {
    type: "element",
    tagName: "span",
    properties: {
      ...(className ? { className } : {}),
      ...(style ? { style } : {}),
    },
    children,
  };
}

// The shape KaTeX emits: denominator, bar, numerator, then a depth row.
function fraction(options: {
  denomTop: number;
  numerTop: number;
  height: number;
  depth: number;
  denom: Node[];
  numer: Node[];
}): Node {
  return span(["mfrac"], undefined, [
    span(["vlist-t", "vlist-t2"], undefined, [
      span(["vlist-r"], undefined, [
        span(["vlist"], `height:${options.height}em`, [
          span(undefined, `top:${options.denomTop}em`, options.denom),
          span(undefined, "top:-3em", [span(["frac-line"], undefined)]),
          span(undefined, `top:${options.numerTop}em`, options.numer),
        ]),
      ]),
      span(["vlist-r"], undefined, [span(["vlist"], `height:${options.depth}em`)]),
    ]),
  ]);
}

function styleOf(node: Node | undefined, property: string): number {
  const raw = node?.properties.style ?? "";
  const match = new RegExp(`${property}:(-?[\\d.]+)em`).exec(raw);
  return match ? Number(match[1]) : Number.NaN;
}

function parts(frac: Node) {
  const vlist = frac.children[0]?.children[0]?.children[0];
  const depth = frac.children[0]?.children[1]?.children[0];
  return {
    denom: vlist?.children[0],
    numer: vlist?.children[2],
    vlist,
    depth,
  };
}

describe("openFractionDenominators", () => {
  it("leaves a plain fraction on KaTeX's own metrics", () => {
    const tree = fraction({
      denomTop: -2,
      numerTop: -4,
      height: 1,
      depth: 0.5,
      denom: [span(undefined, undefined)],
      numer: [span(undefined, undefined)],
    });
    openFractionDenominators(tree);
    const placed = parts(tree);
    expect(styleOf(placed.denom, "top")).toBe(-2);
    expect(styleOf(placed.numer, "top")).toBe(-4);
    expect(styleOf(placed.vlist, "height")).toBe(1);
    expect(styleOf(placed.depth, "height")).toBe(0.5);
  });

  it("opens both sides of a fraction that sits inside another, and drops a denominator that contains one", () => {
    const inner = fraction({
      denomTop: -2,
      numerTop: -4,
      height: 1,
      depth: 0.5,
      denom: [span(undefined, undefined)],
      numer: [span(undefined, undefined)],
    });
    const outer = fraction({
      denomTop: -2,
      numerTop: -4,
      height: 1.2,
      depth: 1,
      denom: [inner],
      numer: [span(undefined, undefined)],
    });
    openFractionDenominators(outer);

    const opened = parts(inner);
    // 0.45em each side of the inner bar.
    expect(styleOf(opened.numer, "top")).toBeCloseTo(-4.45);
    expect(styleOf(opened.denom, "top")).toBeCloseTo(-1.55);
    expect(styleOf(opened.vlist, "height")).toBeCloseTo(1.45);
    expect(styleOf(opened.depth, "height")).toBeCloseTo(0.95);

    const holding = parts(outer);
    // The inner fraction grew 0.45em toward the bar, and the denominator is
    // given a further 0.6em, so the outer denominator drops by 1.05em.
    expect(styleOf(holding.denom, "top")).toBeCloseTo(-0.95);
    expect(styleOf(holding.numer, "top")).toBe(-4);
    expect(styleOf(holding.vlist, "height")).toBe(1.2);
    // Depth covers the drop and the inner fraction's own downward growth.
    expect(styleOf(holding.depth, "height")).toBeCloseTo(2.5);
  });

  it("grows the parentheses with the fraction they enclose", () => {
    const inner = fraction({
      denomTop: -2,
      numerTop: -4,
      height: 1,
      depth: 0.5,
      denom: [span(undefined, undefined)],
      numer: [span(undefined, undefined)],
    });
    const minner = span(["minner"], undefined, [
      span(["mopen", "delimcenter"], "top:0em", [
        span(["delimsizing", "size2"], undefined),
      ]),
      inner,
      span(["mclose", "delimcenter"], "top:0em", [
        span(["delimsizing", "size2"], undefined),
      ]),
    ]);
    const outer = fraction({
      denomTop: -2,
      numerTop: -4,
      height: 1.2,
      depth: 1,
      denom: [minner],
      numer: [span(undefined, undefined)],
    });
    openFractionDenominators(outer);

    const glyphs = [minner.children[0]?.children[0], minner.children[2]?.children[0]];
    for (const glyph of glyphs) {
      const style = glyph?.properties.style ?? "";
      expect(style).toContain("display:inline-block");
      expect(style).toContain("transform-origin:center");
      // The fraction was 1.5em and grew by 0.9em; the bracket goes a little past that.
      const scale = Number(/scaleY\(([\d.]+)\)/.exec(style)?.[1]);
      expect(scale).toBeCloseTo((2.4 / 1.5) * 1.12, 2);
    }
  });
});

function denomTop(root: ParentNode): number {
  const span = root.querySelector(".mfrac > .vlist-t > .vlist-r > .vlist > span");
  return Number.parseFloat(span?.getAttribute("style")?.match(/top:\s*(-?[\d.]+)em/)?.[1] ?? "");
}

describe("the reading surface applies the gap", () => {
  it("lowers the denominator of a nested fraction and leaves a plain one", () => {
    const nested = String.raw`\frac{100}{\frac{90}{4.51}+\frac{6}{2.71}}`;
    const plain = String.raw`\frac{1}{2}`;
    const raw = (tex: string) =>
      new DOMParser().parseFromString(
        katex.renderToString(tex, { displayMode: true, throwOnError: false }),
        "text/html",
      );

    const nestedView = render(
      <ProblemBody body={`$$\n${nested}\n$$`} />,
    );
    const plainView = render(<ProblemBody body={`$$\n${plain}\n$$`} />);

    expect(denomTop(nestedView.container)).toBeGreaterThan(denomTop(raw(nested)));
    expect(denomTop(plainView.container)).toBeCloseTo(denomTop(raw(plain)));
    expect(nestedView.container.querySelector(".katex-error")).toBeNull();
  });
});
