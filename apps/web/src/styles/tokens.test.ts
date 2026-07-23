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
  paper: "#fafaf7",
  accent: "#2c5ae9",
  "rule-line": "#e4e4dc",
  "verify-green": "#1d7a5f",
  "flag-amber": "#b4690e",
};

const darkPalette: Record<string, string> = {
  ground: "#12141a",
  ink: "#e8e6df",
  // The accent stays in dark mode (guide 3.2); asserted below by absence of a
  // second accent value rather than by a token here.
};

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
});
