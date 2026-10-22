import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { CONTENT_CATALOGUE } from "../marketplace/_kit/content";
import { motifFor, SWATCHES, swatchBackground } from "./swatches";

// The material art is pinned to the shipped catalogue (decision 0106): every
// swatch a line names must be drawn, and every category must have decided
// whether it has a form motif, so a new line never ships as plain steel
// without anyone noticing.
const catalogue = JSON.parse(
  readFileSync(resolve(process.cwd(), `../api/catalogue/${CONTENT_CATALOGUE}/v1.json`), "utf8"),
) as { lines: { swatch: string; category: string }[] };

describe("the material swatches cover the catalogue", () => {
  it("draws every swatch the catalogue names", () => {
    const missing = [...new Set(catalogue.lines.map((line) => line.swatch))].filter(
      (key) => !(key in SWATCHES),
    );
    expect(missing).toEqual([]);
  });

  it("falls back to steel for a key it does not know", () => {
    expect(swatchBackground("not-a-material")).toBe(SWATCHES.hrsteel);
  });

  it("has decided a motif for every category", () => {
    const undecided = [...new Set(catalogue.lines.map((line) => line.category))].filter(
      (category) => motifFor(category) === "none",
    );
    expect(undecided).toEqual([]);
  });
});
