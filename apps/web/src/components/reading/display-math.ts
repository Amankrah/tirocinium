import { NESTED_FRACTION_EXTRA_DEPTH_EM } from "./fraction-gap";

// A chain of equalities is one display formula, and KaTeX will not wrap it.
// In the reading column the centred line is wider than the page, so the left
// side cannot be scrolled back to and the last power is cut off, which reads
// as a different equation. Breaking the chain at each top-level "=" is a
// display decision only: the stored solution, and the text sent to the tutor,
// stay the professor's (decision 0086).
//
// The break is applied to the math node remark-math has already extracted.
// Writing the line breaks back into the markdown lets the parser eat them,
// and KaTeX then prints the formula as red source.

type HastNode = {
  type?: string;
  value?: string;
  properties?: { className?: string[] | string };
  children?: HastNode[];
};

function topLevelEquals(tex: string): number[] {
  const at: number[] = [];
  let depth = 0;
  for (let i = 0; i < tex.length; i++) {
    const ch = tex[i];
    if (ch === "\\") {
      i += 1;
      continue;
    }
    if (ch === "{") depth += 1;
    else if (ch === "}" && depth > 0) depth -= 1;
    else if (ch === "=" && depth === 0) at.push(i);
  }
  return at;
}

// The aligned formula, or null when the formula should be left as written.
export function alignDisplayChain(tex: string): string | null {
  const trimmed = tex.trim();
  if (trimmed.includes("\\begin{") || trimmed.includes("\\\\")) return null;
  const cuts = topLevelEquals(trimmed);
  // One relation already fits, or is a single wide fraction. A chain is two
  // or more, which is what runs off the column.
  if (cuts.length < 2) return null;
  const lhs = trimmed.slice(0, cuts[0]).trimEnd();
  const rights = cuts.map((cut, index) =>
    trimmed.slice(cut + 1, cuts[index + 1]).trim(),
  );
  const lines = rights.map((right, index) =>
    index === 0 ? `${lhs} &= ${right}` : `&= ${right}`,
  );
  // A blank \\ stacks a tall fraction against the next equals. The extra em
  // is the gap between those lines, not a change to the formula. One em is
  // enough between plain relations and not between fractions, where the line
  // above ends in a denominator and the line below opens with a numerator.
  // A denominator that is itself a fraction hangs further still, by the same
  // amount the reading surface later opens that bar (decision 0094), so the
  // gap follows the content rather than being a single constant.
  const nested = nestedFractionDepth(trimmed);
  const rowGap =
    nested > 0
      ? em(1.8 + nested * NESTED_FRACTION_EXTRA_DEPTH_EM)
      : trimmed.includes("\\frac")
        ? "1.8em"
        : "1em";
  return `\\begin{aligned}\n${lines.join(` \\\\[${rowGap}]\n`)}\n\\end{aligned}`;
}

function em(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return `${rounded}em`;
}

// How many fractions are drawn inside another fraction. Sibling fractions in
// a chain (\frac{a}{b} = \frac{c}{d}) are depth 0. The alloy rule, a fraction
// over a sum of fractions, is depth 1.
export function nestedFractionDepth(tex: string): number {
  let maxNested = 0;
  let depth = 0;
  const fracOpen: number[] = [];
  let pending = 0;
  let i = 0;
  while (i < tex.length) {
    if (tex[i] === "\\") {
      const cmd = /^\\[a-zA-Z]+/.exec(tex.slice(i));
      const name = cmd?.[0] ?? "";
      if (name === "\\frac" || name === "\\dfrac" || name === "\\tfrac") {
        if (fracOpen.length > 0) maxNested = Math.max(maxNested, fracOpen.length);
        pending += 2;
        i += name.length;
        continue;
      }
      i += name.length > 0 ? name.length : 2;
      continue;
    }
    if (tex[i] === "{") {
      depth += 1;
      if (pending > 0) {
        pending -= 1;
        fracOpen.push(depth);
      }
      i += 1;
      continue;
    }
    if (tex[i] === "}") {
      if (fracOpen[fracOpen.length - 1] === depth) fracOpen.pop();
      depth = Math.max(0, depth - 1);
      i += 1;
      continue;
    }
    // A lone token can be a \frac argument (\frac12). A character inside a
    // group is part of the group that already counted as the argument.
    if (pending > 0 && depth === 0 && tex[i] !== " ") pending -= 1;
    i += 1;
  }
  return maxNested;
}

function isMathElement(node: HastNode): boolean {
  const names = node.properties?.className;
  const classes = typeof names === "string" ? names.split(" ") : names;
  if (!classes) return false;
  return classes.some(
    (name) => name === "math-inline" || name === "math-display" || name === "language-math",
  );
}

// Runs before rehype-katex. The formula's text is what KaTeX reads; changing
// the markdown node is not enough, because the HTML text is taken from the
// original source.
export function rehypeBreakDisplayChains() {
  return (tree: HastNode) => {
    const walk = (node: HastNode) => {
      if (isMathElement(node)) {
        for (const child of node.children ?? []) {
          if (child.type === "text" && typeof child.value === "string") {
            const aligned = alignDisplayChain(child.value);
            if (aligned !== null) child.value = aligned;
          }
        }
      }
      node.children?.forEach(walk);
    };
    walk(tree);
  };
}
