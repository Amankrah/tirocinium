import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { normalizeMath } from "./markdown";

// The transcription prompts write \( \) and \[ \]; remark-math reads only
// dollars, and markdown eats the backslash (decision 0098). Only delimiters
// change: the formula's text is passed through exactly.
describe("normalizeMath", () => {
  it("turns \\( \\) into inline dollars", () => {
    expect(normalizeMath(String.raw`Mass \(m_1 + m_2\) here`)).toBe(
      "Mass $m_1 + m_2$ here",
    );
  });

  it("turns \\[ \\] into a display block on its own lines", () => {
    expect(normalizeMath(String.raw`Then \[ \frac{a}{b} = c \] so`)).toBe(
      ["Then", "", "$$", String.raw`\frac{a}{b} = c`, "$$", "", " so"].join("\n"),
    );
  });

  it("keeps a display inside the list item it belongs to", () => {
    const out = normalizeMath(String.raw`1. Find \[x = 1\]`);
    expect(out).toContain("\n   $$\n   x = 1\n   $$\n");
  });

  it("gives a one-line $$ formula its own display block", () => {
    expect(normalizeMath("$$V_C = a^3$$")).toBe(["", "$$", "V_C = a^3", "$$", ""].join("\n"));
  });

  it("leaves a $$ formula in the middle of a sentence inline", () => {
    const source = "The volume $$V = a^3$$ follows.";
    expect(normalizeMath(source)).toBe(source);
  });

  it("never reads a row gap as a display opening", () => {
    const block = ["$$", String.raw`\begin{aligned} a &= b \\[1em] &= c \end{aligned}`, "$$"].join("\n");
    expect(normalizeMath(block)).toBe(block);
    const inline = String.raw`$\begin{aligned} a \\[2em] b \end{aligned}$`;
    expect(normalizeMath(inline)).toBe(inline);
  });

  it("leaves code, escaped backslashes, and unclosed brackets as written", () => {
    const fenced = ["```", String.raw`\(not math\)`, "```"].join("\n");
    expect(normalizeMath(fenced)).toBe(fenced);
    const span = "Type `\\(x\\)` to write math.";
    expect(normalizeMath(span)).toBe(span);
    const escaped = String.raw`A literal \\(x\\) stays.`;
    expect(normalizeMath(escaped)).toBe(escaped);
    const open = String.raw`An \( with no close`;
    expect(normalizeMath(open)).toBe(open);
  });

  it("does not let a bracket reach across a paragraph break", () => {
    const source = ["Open \\( here", "", "and close \\) there"].join("\n");
    expect(normalizeMath(source)).toBe(source);
  });
});

// The backend normalises an import at confirmation with its own twin of this
// function; both run this one table, so stored text and rendered text follow
// one rule (decision 0099).
const shared = JSON.parse(
  readFileSync(
    // Vitest runs from apps/web; jsdom gives import.meta.url no file scheme.
    resolve(process.cwd(), "../api/tests/fixtures/math-delimiters.json"),
    "utf8",
  ),
) as { cases: { name: string; source: string; expected: string }[] };

describe("normalizeMath agrees with the backend", () => {
  it.each(shared.cases)("$name", ({ source, expected }) => {
    expect(normalizeMath(source)).toBe(expected);
    expect(normalizeMath(expected)).toBe(expected);
  });
});
