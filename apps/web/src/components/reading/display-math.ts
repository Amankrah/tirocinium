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
  // is the gap between those lines, not a change to the formula.
  return `\\begin{aligned}\n${lines.join(" \\\\[1em]\n")}\n\\end{aligned}`;
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
