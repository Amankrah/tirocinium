import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CITED,
  CONTENT_CATALOGUE,
  FEATURED,
  GUIDE,
  PRESETS,
  SPECIFIC_STRENGTH_RATIO,
} from "./content";

// The guide prints figures, and figures go stale. This reads the shipped
// catalogue itself (the asset the server prices from) and holds every number
// and SKU the copy depends on to it (decision 0101).

type Line = {
  sku: string;
  supplier: string;
  list_price_cents: number;
  properties: { rho?: number; sy?: number; E?: number };
};
type CatalogueFile = {
  id: string;
  suppliers: { id: string; name: string; city: string }[];
  lines: Line[];
};

const catalogue = JSON.parse(
  readFileSync(
    // Vitest runs from apps/web; jsdom gives import.meta.url no file scheme.
    resolve(process.cwd(), `../api/catalogue/${CONTENT_CATALOGUE}/v1.json`),
    "utf8",
  ),
) as CatalogueFile;

const bySku = new Map(catalogue.lines.map((line) => [line.sku, line]));
const line = (sku: string): Line => {
  const found = bySku.get(sku);
  if (!found) throw new Error(`${sku} is not in the catalogue`);
  return found;
};

describe("the marketplace's editorial content", () => {
  it("names only lines the catalogue stocks", () => {
    for (const sku of [...FEATURED, ...PRESETS.flatMap((preset) => preset.skus)]) {
      expect(bySku.has(sku), sku).toBe(true);
    }
  });

  it("cites list prices the catalogue actually charges", () => {
    for (const cited of CITED) {
      expect(line(cited.sku).list_price_cents, cited.sku).toBe(cited.listPriceCents);
    }
    const prose = GUIDE.functionRows.map((row) => row[2]).join(" ") + GUIDE.citeExample("X");
    for (const cited of CITED) {
      expect(prose).toContain(`$${(cited.listPriceCents / 100).toFixed(2)}/kg`);
    }
  });

  it("states the specific-strength ratio the properties give", () => {
    const a36 = line("LMS-A36-PL06").properties;
    const al = line("LMS-6061-PL06").properties;
    const ratio = (al.sy! / al.rho!) / (a36.sy! / a36.rho!);
    expect(ratio.toFixed(1)).toBe(SPECIFIC_STRENGTH_RATIO);
  });

  it("states the moduli the FRP example leans on", () => {
    expect(line("TFC-FRP-TUBE50").properties.E).toBe(17);
    expect(line("LMS-HSS-5032").properties.E).toBe(200);
  });

  it("cites the supplier and city that really stock the example line", () => {
    const example = line("BSA-316L-2B");
    const supplier = catalogue.suppliers.find((entry) => entry.id === example.supplier);
    expect(supplier).toBeDefined();
    const cite = GUIDE.citeExample("X");
    expect(cite).toContain(supplier!.name);
    expect(cite).toContain(supplier!.city.split(",")[0]!);
  });
});
