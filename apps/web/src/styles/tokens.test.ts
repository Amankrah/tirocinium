import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Token contract: the palette in tokens.css is the frontend guide's section 3.2
// palette, verbatim. This test pins the spec values so a refactor of the token
// layer can never silently drift a colour. Values compare case-insensitively;
// the file is the styling source of truth, the guide is the value source of truth.
const tokens = readFileSync(join(__dirname, "tokens.css"), "utf8").toLowerCase();

const palette: Record<string, string> = {
  ink: "#161a23",
  "ink-muted": "#5b5e64",
  paper: "#fafaf7",
  accent: "#2c5ae9",
  "rule-line": "#e4e4dc",
  "verify-green": "#1d7a5f",
  "flag-amber": "#b4690e",
};

const darkPalette: Record<string, string> = {
  ground: "#12141a",
  ink: "#e8e6df",
  "ink-muted": "#9a99a3",
  // The accent stays in dark mode (guide 3.2); asserted below by absence of a
  // second accent value rather than by a token here.
};

// WCAG 2.2 relative luminance and contrast (guide 6: AA is the floor). The
// muted foreground is a solid token precisely so its contrast is a tested
// constant, not an alpha that drifts onto the 4.5:1 boundary (decision 0017).
function luminance(hex: string): number {
  const channel = (offset: number): number => {
    const c = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a: string, b: string): number {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

describe("tokens.css carries the guide 3.2 palette", () => {
  it.each(Object.entries(palette))("defines light token %s as %s", (name, value) => {
    expect(tokens).toMatch(new RegExp(`--color-${name}:\\s*${value}\\b`));
  });

  it.each(Object.entries(darkPalette))("defines dark token %s as %s", (name, value) => {
    expect(tokens).toMatch(new RegExp(`--color-${name}:\\s*${value}\\b`));
  });

  it("keeps a single accent value across both themes", () => {
    const accents = tokens.match(/--color-accent:\s*(#[0-9a-f]{6})/g) ?? [];
    const distinct = new Set(accents.map((a) => a.replace(/.*(#[0-9a-f]{6})/, "$1")));
    expect(distinct).toEqual(new Set(["#2c5ae9"]));
  });

  it("declares a dark theme via prefers-color-scheme", () => {
    expect(tokens).toContain("prefers-color-scheme: dark");
  });

  // The muted foreground must clear AA for normal-size text (4.5:1) against the
  // surface it sits on, in both themes. It is used at text-sm and text-xs, so
  // the normal-text threshold, not the large-text 3:1, is the bar.
  it("keeps the muted foreground above AA in light mode", () => {
    const muted = palette["ink-muted"];
    const paper = palette.paper;
    expect(muted).toBeDefined();
    expect(paper).toBeDefined();
    expect(contrast(muted as string, paper as string)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps the muted foreground above AA in dark mode", () => {
    const muted = darkPalette["ink-muted"];
    const ground = darkPalette.ground;
    expect(muted).toBeDefined();
    expect(ground).toBeDefined();
    expect(contrast(muted as string, ground as string)).toBeGreaterThanOrEqual(4.5);
  });
});
