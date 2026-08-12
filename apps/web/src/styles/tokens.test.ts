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
  // Corrected from the guide's #b4690e, which reads 4.04:1 on paper and is used
  // at small text sizes throughout: guide 3.2 calls the palette "a starting
  // point, to be refined in design review", while guide 6 states the AA floor
  // without qualification, so the floor wins (decision 0062).
  "flag-amber": "#9c5a0b",
  // A form field's boundary is a UI component boundary (WCAG 2.2 1.4.11), which
  // the 1.22:1 hairline cannot carry.
  "field-border": "#82858d",
};

const darkPalette: Record<string, string> = {
  ground: "#12141a",
  ink: "#e8e6df",
  "ink-muted": "#9a99a3",
  "accent-text": "#7c9bff",
  "rule-line": "#2a2d35",
  "field-border": "#65686f",
  "verify-green": "#46ac8b",
  "flag-amber": "#db9435",
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

  // The accent doing a different job, as --color-on-accent already does: it is
  // the accent itself in light mode, and lightens in dark where the accent
  // reads only 3.28:1 as text (decision 0062).
  it("aliases the accent-as-text to the accent in light mode", () => {
    expect(tokens).toContain("--color-accent-text: var(--color-accent)");
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

// The contrast audit of milestone 9.3, as a test rather than a one-off: every
// pair the product actually renders, in both themes, at the threshold its role
// demands. It found four real failures when first written (decision 0062), so
// the value here is precisely that it runs again on every change.
//
// Thresholds: 4.5:1 for text, because every one of these is used at text-sm or
// text-xs somewhere, so the large-text 3:1 allowance never applies; 3:1 for a
// UI component boundary and for a focus indicator (WCAG 2.2 1.4.11).
describe("the contrast audit, both themes", () => {
  // accent-text is an alias of the accent in light mode, resolved here so the
  // audit compares rendered colours rather than declarations.
  const LIGHT = {
    ground: "#fafaf7",
    ...palette,
    "accent-text": palette.accent as string,
  };
  const DARK = {
    ...LIGHT,
    ...darkPalette,
    // Paper maps to the dark ground, so anything still expressed as paper sits
    // on the ground in dark mode.
    paper: darkPalette.ground as string,
    accent: palette.accent as string,
  };

  const textPairs: [string, string][] = [
    ["ink", "paper"],
    ["ink-muted", "paper"],
    ["accent-text", "paper"],
    ["verify-green", "paper"],
    ["flag-amber", "paper"],
  ];

  for (const [theme, tokenSet] of [
    ["light", LIGHT],
    ["dark", DARK],
  ] as const) {
    it.each(textPairs)(
      `keeps %s on %s above AA for text in ${theme} mode`,
      (fg, bg) => {
        const set = tokenSet as Record<string, string>;
        expect(contrast(set[fg] as string, set[bg] as string)).toBeGreaterThanOrEqual(
          4.5,
        );
      },
    );

    it(`keeps text on the accent fill above AA in ${theme} mode`, () => {
      // on-accent is deliberately identical in both themes: the accent needs
      // light text whatever surrounds it.
      expect(contrast("#fafaf7", palette.accent as string)).toBeGreaterThanOrEqual(4.5);
    });

    it(`keeps a field boundary above the 3:1 component threshold in ${theme} mode`, () => {
      const set = tokenSet as Record<string, string>;
      expect(
        contrast(set["field-border"] as string, set.paper as string),
      ).toBeGreaterThanOrEqual(3);
    });

    it(`keeps the focus indicator above 3:1 in ${theme} mode`, () => {
      const set = tokenSet as Record<string, string>;
      // Focus is a two-pixel accent outline with an offset, so it is judged
      // against the surface it sits on, not against the control it rings.
      expect(contrast(palette.accent as string, set.paper as string)).toBeGreaterThanOrEqual(3);
    });
  }

  // The hairline is structure, not a component boundary, so it is exempt from
  // 1.4.11; what it must not be is invisible in one theme and glaring in the
  // other, which is what a token that failed to invert was doing (14.40:1 on
  // the dark ground).
  it("keeps the hairline subtle in both themes rather than inverting to a gash", () => {
    const light = contrast(palette["rule-line"] as string, palette.paper as string);
    const dark = contrast(
      darkPalette["rule-line"] as string,
      darkPalette.ground as string,
    );
    expect(light).toBeLessThan(2);
    expect(dark).toBeLessThan(2);
  });
});
