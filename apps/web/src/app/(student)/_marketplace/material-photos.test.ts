import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { MATERIAL_PHOTOS, materialPhoto } from "./material-photos";
import { SWATCHES } from "./swatches";

// Every kept photograph names a swatch the catalogue draws, and the file it
// points at is in the tree (decision 0115). A swatch with no photograph is
// still drawn.
describe("the material photographs", () => {
  it("names a swatch that is drawn, and keeps the file", () => {
    for (const [key, photo] of Object.entries(MATERIAL_PHOTOS)) {
      expect(key in SWATCHES, key).toBe(true);
      expect(photo.depicts.length, key).toBeGreaterThan(0);
      expect(photo.author.length, key).toBeGreaterThan(0);
      expect(photo.license.length, key).toBeGreaterThan(0);
      expect(photo.source.startsWith("https://commons.wikimedia.org/"), key).toBe(true);
      expect(existsSync(resolve(process.cwd(), "public", photo.src.slice(1))), key).toBe(true);
    }
  });

  it("stays off a line the picture does not depict", () => {
    expect(materialPhoto("duplex", "BSA-17-4PH")).toBeUndefined();
    expect(materialPhoto("galv", "LMS-HSS-5032")).toBeUndefined();
    expect(materialPhoto("svcw", "MFW-GTAW-HR")).toBeUndefined();
    expect(materialPhoto("galv", "LMS-GALV-SH10")?.depicts).toBe("Galvanised sheet.");
    expect(materialPhoto("svcw", "MFW-GMAW-HR")?.depicts).toBe("Gas metal arc welding.");
  });
});
