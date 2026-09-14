// Lifts the BREE 216 teaching artifact into the versioned catalogue asset that
// milestone 10.1 loads (decision 0062). The JSON it writes is the project asset
// and is reviewed like code; this script is only how it was first produced, and
// is re-runnable if the source artifact is ever revised.
//
//   node infra/extract-marketplace-catalogue.mjs \
//     "BREE 216 Marketplace.html" apps/api/catalogue/bree-216/v1.json

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import vm from "node:vm";

const [, , sourcePath, outPath] = process.argv;
if (!sourcePath || !outPath) {
  console.error("usage: extract-marketplace-catalogue.mjs <source.html> <out.json>");
  process.exit(2);
}

const html = readFileSync(sourcePath, "utf8");

// The artifact declares its data as four top-level consts inside one script
// block. Slice from the first to the end of the last and evaluate that alone,
// so none of the rendering code runs.
function slice(startMarker, endMarker) {
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker, start);
  if (start < 0 || end < 0) throw new Error(`could not locate ${startMarker}`);
  return html.slice(start, end);
}

const dataSource = slice("const FX = ", "/* ============================================================\n   State");
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(`${dataSource}\nthis.out = { SW, STORES, ROWS, BRIEFS, FX, GST, QST };`, sandbox);
const { STORES, ROWS, BRIEFS, GST, QST } = sandbox.out;

// ---------------------------------------------------------------------------
// Volatility bands (decision 0062). Authored once here, then data in the JSON.
// A band is the half-width of the seeded price perturbation: commodity mild
// steel barely moves, a nickel-and-molybdenum grade moves a lot, a shop rate
// hardly moves at all.
// ---------------------------------------------------------------------------
const BANDS = [
  [(p) => p.service, 0.02],
  [(p) => /COAT|PLATE|HVOF|DLC|TIN-/.test(p.sku) && p.supplier === "VHM", 0.03],
  [(p) => /NI200|TI-GR2/.test(p.sku), 0.2],
  [(p) => /WC\d|CARBIDE|WCCO|WCROD|STEL/.test(p.sku), 0.18],
  [(p) => /316|2205|904L|17-4PH/.test(p.sku), 0.16],
  [(p) => p.sku.startsWith("TFC-CF"), 0.15],
  [(p) => /FLAX|HEMP|JUTE|STRAW|BALSA|BIO|FURAN/.test(p.sku), 0.12],
  [(p) => p.supplier === "BSA", 0.1],
  [(p) => p.supplier === "TFC" && p.category === "Resins", 0.1],
  [(p) => p.category === "Aluminium", 0.09],
  [(p) => /AL2O3|SIC|ZRO2|SI3N4/.test(p.sku), 0.09],
  [(p) => p.supplier === "VHM", 0.08],
  [(p) => p.supplier === "CPP" && p.category === "Glazing", 0.07],
  [(p) => p.supplier === "CPP", 0.08],
  [(p) => p.supplier === "TFC", 0.07],
  [() => true, 0.06],
];

const band = (line) => BANDS.find(([test]) => test(line))[1];

// A line is oversize when its spec quotes a length of three metres or more,
// which is what attracts the long-load surcharge on the freight estimate. The
// source artifact matched a fixed list of length strings; reading the number is
// the same rule without the list to keep up to date. "2440 mm" does not match,
// because `m\b` does not fall between the two m's.
const oversize = (spec) =>
  [...spec.matchAll(/(\d+(?:\.\d+)?)\s*m\b/g)].some((m) => Number(m[1]) >= 3);

const cents = (n) => Math.round(Number(n) * 100);

const PRICE_BREAKS = {
  kg: [[100, 4], [500, 9], [2000, 14]],
  m: [[50, 3], [200, 7], [600, 11]],
  m2: [[25, 4], [100, 8]],
  L: [[40, 5], [160, 10]],
  ea: [[25, 3], [100, 7], [500, 12]],
  hr: [],
};

const suppliers = STORES.map((s) => ({
  id: s.id,
  name: s.name,
  tagline: s.tag,
  glyph: s.em,
  city: s.city,
  established: s.est,
  rating: s.rating,
  review_count: s.revs,
  shipping: s.ship,
  categories: s.cats,
  blurb: s.blurb,
  policy: s.policy,
  minimum_order_note: s.moqnote,
}));

const lines = [];
for (const [supplier, rows] of Object.entries(ROWS)) {
  for (const r of rows) {
    const line = {
      sku: r[0],
      supplier,
      category: r[1],
      name: r[2],
      spec: r[3],
      list_price_cents: cents(r[4]),
      unit: r[5],
      kg_per_unit: r[6],
      moq: r[7],
      lead_days: r[8],
      stock: r[9],
      cut_fee_cents: cents(r[10]),
      swatch: r[11],
      properties: r[12] ?? {},
      tags: r[13] ?? [],
      description: r[14] ?? "",
      fabrication: r[15] ?? "",
      service: r[5] === "hr" || supplier === "MFW",
    };
    line.volatility = band(line);
    line.oversize = oversize(line.spec);
    lines.push(line);
  }
}

const skus = new Set(lines.map((l) => l.sku));
const briefs = BRIEFS.map((b, i) => {
  const missing = b.sk.filter((s) => !skus.has(s));
  if (missing.length) throw new Error(`brief ${i} names unknown lines: ${missing.join(", ")}`);
  return {
    id: `brief-${String(i + 1).padStart(2, "0")}`,
    title: b.t,
    selection_factors: b.fn.split(" · "),
    candidate_families: b.ch,
    shortlist: b.sk,
  };
});

const catalogue = {
  id: "bree-216",
  version: 1,
  title: "BREE 216 \u2014 Bioresource Engineering Materials",
  course_note:
    "A teaching catalogue. The supplier entities are fictional and no order can be placed; the prices are anchored to published August 2026 supplier and commodity data and are then perturbed per variant.",
  currency: "CAD",
  taxes: [
    { code: "GST", rate: GST },
    { code: "QST", rate: QST },
  ],
  freight: { base_cents: 4500, per_kg_cents: 85, long_item_cents: 2200 },
  price_breaks: PRICE_BREAKS,
  quote_validity_days: 14,
  suppliers,
  lines,
  briefs,
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(catalogue, null, 2)}\n`, "utf8");

const byBand = lines.reduce((acc, l) => {
  acc[l.volatility] = (acc[l.volatility] ?? 0) + 1;
  return acc;
}, {});
console.log(
  `wrote ${outPath}: ${suppliers.length} suppliers, ${lines.length} lines, ${briefs.length} briefs`,
);
console.log("volatility bands:", byBand);
