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

// \left( ... \right) is a group as much as braces are: an "&" inside it ends
// the row before \right and KaTeX refuses the formula.
function topLevelEquals(tex: string): number[] {
  const at: number[] = [];
  let depth = 0;
  let i = 0;
  while (i < tex.length) {
    const ch = tex[i];
    if (ch === "\\") {
      const name = /^\\[a-zA-Z]+/.exec(tex.slice(i))?.[0];
      if (name === "\\left") depth += 1;
      else if (name === "\\right" && depth > 0) depth -= 1;
      i += name ? name.length : 2;
      continue;
    }
    if (ch === "{") depth += 1;
    else if (ch === "}" && depth > 0) depth -= 1;
    else if (ch === "=" && depth === 0) at.push(i);
    i += 1;
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

// The commands KaTeX draws as a stacked fraction (an mfrac), which is what
// the reading surface opens (decision 0094).
const FRACTIONS = new Set([
  "\\frac",
  "\\dfrac",
  "\\tfrac",
  "\\cfrac",
  "\\binom",
  "\\dbinom",
  "\\tbinom",
]);

// How many fractions are drawn inside another fraction. Sibling fractions in
// a chain (\frac{a}{b} = \frac{c}{d}) are depth 0. The alloy rule, a fraction
// over a sum of fractions, is depth 1.
export function nestedFractionDepth(tex: string): number {
  let maxNested = 0;
  let depth = 0;
  // Brace depths that are a fraction's argument.
  const fracOpen: number[] = [];
  // Fractions still waiting for arguments, at the depth they were written.
  const pending: { depth: number; remaining: number }[] = [];
  // An argument is the next token at the fraction's own depth: a group, a
  // command (\frac\alpha\beta), or a lone character (\frac12).
  const takeArgument = (): boolean => {
    const top = pending[pending.length - 1];
    if (!top || top.depth !== depth) return false;
    top.remaining -= 1;
    if (top.remaining === 0) pending.pop();
    return true;
  };
  let i = 0;
  while (i < tex.length) {
    const ch = tex[i];
    if (ch === "\\") {
      const name = /^\\[a-zA-Z]+/.exec(tex.slice(i))?.[0];
      takeArgument();
      if (name && FRACTIONS.has(name)) {
        maxNested = Math.max(maxNested, fracOpen.length);
        pending.push({ depth, remaining: 2 });
      }
      i += name ? name.length : 2;
      continue;
    }
    if (ch === "{") {
      const isArgument = takeArgument();
      depth += 1;
      if (isArgument) fracOpen.push(depth);
      i += 1;
      continue;
    }
    if (ch === "}") {
      if (fracOpen[fracOpen.length - 1] === depth) fracOpen.pop();
      // A fraction left short of its arguments inside this group is malformed;
      // forget it rather than hand it the tokens after the group.
      while (pending.length > 0 && (pending[pending.length - 1]?.depth ?? 0) >= depth) {
        pending.pop();
      }
      depth = Math.max(0, depth - 1);
      i += 1;
      continue;
    }
    if (!/\s/.test(ch ?? "")) takeArgument();
    i += 1;
  }
  return maxNested;
}

// Display math only. remark-math gives inline formulas the language-math
// class too, and an aligned block in the middle of a sentence is a 3.7em
// interruption of the line it belongs to (decision 0086: inline math is left as
// written).
function isDisplayMath(node: HastNode): boolean {
  const names = node.properties?.className;
  const classes = typeof names === "string" ? names.split(" ") : names;
  return classes?.includes("math-display") ?? false;
}

// Runs before rehype-katex. The formula's text is what KaTeX reads; changing
// the markdown node is not enough, because the HTML text is taken from the
// original source.
export function rehypeBreakDisplayChains() {
  return (tree: HastNode) => {
    const walk = (node: HastNode) => {
      if (isDisplayMath(node)) {
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
