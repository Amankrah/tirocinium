// The editorial content of the project marketplace (decision 0101), carried
// over from the BREE 216 teaching prototype: the guide to building a quote,
// where the prices come from, the featured lines, the comparisons worth
// making, and the environmental layer a selection is argued against.
// It belongs to one catalogue, so every page that shows it
// checks the catalogue id first and stays quiet for any other.
//
// Figures the copy cites are pinned against the shipped catalogue by
// `content.test.ts`, so a catalogue revision that moves a price fails a test
// instead of leaving the guide quietly wrong. Two of the prototype's own
// examples did not survive that check (a 2.9x that the data puts at 3.2x, and
// two per-square-metre prices for lines sold per sheet), and are corrected or
// dropped here.

export const CONTENT_CATALOGUE = "bree-216";

// Lines a project most often starts from, in the prototype's order.
export const FEATURED = [
  "LMS-HSS-5032",
  "BSA-316L-2B",
  "CPP-PC-TW8",
  "TFC-FLAX-300",
  "VHM-WC6-INS",
  "CPP-HDPE-50",
  "LMS-AR400",
  "MFW-GALV-HD",
];

export type Preset = { title: string; body: string; skus: string[] };

export const PRESETS: Preset[] = [
  {
    title: "Same section, three materials",
    body: "50 × 50 mm square tube: identical geometry, three very different answers.",
    skus: ["LMS-HSS-5032", "LMS-6061-TUBE", "TFC-FRP-TUBE50"],
  },
  {
    title: "304 vs. 316 vs. 316L",
    body: "The single most common trade-off in food-contact equipment, and it turns on 2 % molybdenum.",
    skus: ["BSA-304-2B", "BSA-316-2B", "BSA-316L-2B", "BSA-316L-EP"],
  },
  {
    title: "Glass vs. flax vs. carbon",
    body: "Price, specific stiffness and embodied energy pull in three different directions.",
    skus: ["TFC-WR-600", "TFC-FLAX-300", "TFC-BAS-300", "TFC-CF-200"],
  },
  {
    title: "Cost, strength and carbon",
    body: "Mild steel, aluminium, flax and carbon fibre. Price, specific strength and carbon do not pick the same winner.",
    skus: ["LMS-A36-PL06", "LMS-6061-PL06", "TFC-FLAX-300", "TFC-CF-200"],
  },
];

// Lines the environmental page sets side by side. The page reads their
// figures from the catalogue the seat is actually on, so this list is only
// which lines, never what they measure.
export const IMPACT_SKUS = [
  "LMS-A36-PL06",
  "LMS-6061-PL06",
  "LMS-REBAR-15M",
  "BSA-TI-GR2",
  "TFC-FLAX-300",
  "TFC-CF-200",
  "TFC-BALSA-12",
  "CPP-HDPE-50",
];

export const IMPACT = {
  title: "Cost, performance and impact",
  lede: "A selection that argues only on price, or only on strength, is half an argument. These figures put cradle-to-gate impact on the same table as cost and the mechanical indices.",
  indicatorsHeading: "Four indicators, one kilogram",
  indicators: [
    ["Embodied energy", "The energy to make a kilogram and bring it to the supplier's gate, in MJ/kg."],
    [
      "Carbon footprint",
      "kg CO₂e/kg, cradle-to-gate. Below zero, the material stores more carbon than its production emitted, for as long as that carbon stays in the part.",
    ],
    [
      "Water footprint",
      "Litres per kilogram. A dry process and a thirsty fibre can reverse a ranking that carbon alone would give.",
    ],
    [
      "End-of-life recovery",
      "The share that is realistically collected and returned to use. Recyclability on the data sheet is the theoretical figure. The gap is decided by how you join, coat and mix the material, and by whether a stream exists to take it back.",
    ],
  ] as [string, string][],
  bands:
    "Each per-kilogram figure carries a band from the lecture scale: very low, low, moderate, high, or very high. Carbon below zero is carbon negative. The band is computed with the figure, so the line, the comparison and this page cannot disagree.",
  quote:
    "A quotation multiplies the per-unit figure by the quantity. A metre of tube is not a kilogram, and an hour of machining has no mass, so a process states energy and carbon per unit of process and leaves water blank rather than as zero.",
  freight:
    "The quotation's carbon stops at the supplier's gate. Road freight is a separate line: 450 km at 0.11 kg CO₂e per tonne-kilometre, the Québec road assumption. It is not added into the cradle-to-gate total.",
  indices:
    "When a tie is limited by strength, minimise ρ·CO₂/σy. When it is limited by stiffness, minimise ρ·CO₂/√E. Carbon per dollar is the footprint of a dollar of material. Lower is better on all three, including a negative number. The comparison computes them.",
  mistakesHeading: "Four ways this goes wrong",
  mistakes: [
    [
      "Comparing per kilogram when the design fixes a volume or a function.",
      "A light material can carry more carbon per kilogram and less carbon in the part. Convert to the function before you rank.",
    ],
    [
      "Stopping at cradle-to-gate.",
      "Use, maintenance and how many times you replace the part often dominate, and none of those are in this figure.",
    ],
    [
      "Ignoring the replacement cycle.",
      "A harder steel that outlasts three mild-steel parts can win on carbon even when its per-kilogram figure is higher.",
    ],
    [
      "Treating recyclability as a property of the material.",
      "Recovery is a joining and collection decision. A coating or a mixed laminate can throw away a recovery the data sheet promised.",
    ],
  ] as [string, string][],
  absent:
    "This catalogue version does not carry carbon, water or end-of-life recovery. Embodied energy and recyclability are on each material's data sheet and in the comparison. A later version adds the rest, and a course stays on the version it is pinned to until it is re-pinned.",
  tableHeading: "A few lines, side by side",
  tableLede:
    "These are lines in the catalogue you are browsing, at list price. Open one for the band and the per-unit figure.",
  columns: ["Line", "Price", "Carbon", "Energy", "Water", "Recovery"],
};

// A figure the guide states, and the catalogue line it is read from. The test
// checks each one; the page prints the text.
export type Cited = { sku: string; listPriceCents: number };

export const CITED: Cited[] = [
  { sku: "LMS-A36-PL06", listPriceCents: 520 },
  { sku: "LMS-6061-PL06", listPriceCents: 985 },
  { sku: "LMS-AR400", listPriceCents: 975 },
  { sku: "BSA-316L-2B", listPriceCents: 1620 },
];

// 6061-T6 against A36, specific strength (yield over density), to one place.
export const SPECIFIC_STRENGTH_RATIO = "3.2";

export const GUIDE = {
  title: "How to build a quote your marker will believe",
  lede:
    "Most material-selection reports lose marks in the same place: the cost column. A single number with no basis, no quantity and no date is not a cost estimate. Here is what a defensible one contains, and how this marketplace produces it.",
  functionHeading: "1 · Price the function, not the kilogram",
  functionBody:
    "A price per kilogram tells you almost nothing on its own. What your design consumes is a function: a beam that resists a bending moment, a panel that stops a heat flux, a pipe that contains a pressure. Convert every candidate to the cost of delivering that function before you compare.",
  functionColumns: ["If the design is limited by", "Minimise", "From this catalogue"],
  functionRows: [
    [
      "Strength at minimum mass",
      "ρ·Cm / σy",
      `A36 plate at $5.20/kg beats 6061-T6 at $9.85/kg on cost, but 6061 has ${SPECIFIC_STRENGTH_RATIO}× the specific strength, so for a mass-limited part the aluminium can still win.`,
    ],
    [
      "Stiffness at minimum mass",
      "ρ·Cm / E½",
      "Pultruded FRP tube looks light until you notice E = 17 GPa against 200 for steel. Deflection, not stress, will govern your frame.",
    ],
    [
      "Heat loss through an envelope",
      "Carea · U",
      "Polyethylene film is far cheaper per sheet than twin-wall polycarbonate, but it is replaced every few years and insulates far worse. Compare cost per square metre per year of service, not per sheet.",
    ],
    [
      "Abrasive wear life",
      "Cpart / wear life",
      "AR400 at $9.75/kg lasts roughly three times as long as A36 at $5.20/kg. Per hour of service it is the cheaper plate.",
    ],
  ],
  invoiceHeading: "2 · Include everything a real invoice includes",
  invoiceBody:
    "Material price is rarely more than half of what lands on the invoice. The quotation here applies each of the following automatically, so read the lines rather than just the total.",
  invoiceColumns: ["Line", "How it works here", "Why it matters to your argument"],
  datingHeading: "3 · Date it, bound it, and cite it",
  datingBody:
    "Commodity-linked prices move. Every quotation here carries a reference, the date it was prepared and how long the list prices hold. Copy all three into your report. A price without a date is not a price.",
  citeLead: "In your report, write it like this:",
  citeExample: (reference: string) =>
    `316L stainless sheet, 1.5 mm, 2B finish: $16.20/kg (Boréal Stainless & Alloy, list price, quotation ${reference}, 21 Oct 2026, 10 kg minimum order, ex-tax, ex-works Saint-Laurent QC).`,
  tradeoffHeading: "4 · Then argue the trade-off",
  tradeoffBody:
    "The marketplace gives you the numbers. It does not give you the decision. Your Pugh chart still has to weight cost against the properties that matter for the brief, and your report has to defend those weights. A shortlist where the cheapest option wins every criterion means you have not chosen a hard enough shortlist.",
};

export const SOURCES = {
  title: "Where these prices come from",
  lede:
    "The suppliers here are fictional. The prices are not. Every catalogue figure was anchored to published supplier or commodity data retrieved in August 2026, converted to Canadian dollars at USD 1.00 = CAD 1.37, and adjusted for form, grade and order quantity using the multipliers those same sources publish. Where a source gave a range, the catalogue sits near its midpoint.",
  notice:
    "You may cite the marketplace as your vendor quotation; that is what it is for. If you want to go further and cite the underlying market data directly, the primary sources are below. Either is defensible; inventing a number is not.",
  columns: ["Catalogue area", "Anchor data used", "Primary source"],
  rows: [
    ["Carbon steel plate, sheet and bar", "Retail cut-piece pricing for 44W hot-rolled sheet, cold-finished 1018, 4140 and T400 abrasion plate, July 2026", "Metals ’R’ Us (Canada), steel plate and bar price guide", "metalsrus.ca"],
    ["Commodity metal spot prices", "Aluminium CA$2.02/lb, copper CA$8.97/lb, nickel CA$10.56/lb, zinc CA$2.33/lb, steel rebar CA$623.48/t, 18 Aug 2026", "Daily Metal Price (CAD table)", "dailymetalprice.com"],
    ["Stainless steel by grade and form", "304 sheet US$1.55 to 1.85/lb, 316L sheet US$2.05 to 2.55/lb, 2205 duplex US$3.10 to 3.90/lb, 17-4 PH US$3.60 to 5.00/lb, May 2026", "MW Alloys, stainless prices per pound", "mwalloys.com"],
    ["6061 aluminium", "Mill-direct US$2.40/lb average, retail small-quantity US$3.50 to 6.00/lb; form multipliers for plate, extrusion and temper", "Hugh Aluminum, 6061 cost per pound 2026", "hugh-aluminum.com"],
    ["HDPE pipe", "2 in IPS SDR11 PE4710 at US$2.94/ft, with the 1 in to 12 in ladder and the US$0.50 to 10.00 cutting-fee schedule this catalogue reproduces", "HDPE Supply, PE4710 straight length per foot", "hdpesupply.com"],
    ["PVC pressure pipe", "Schedule 40 at US$0.50 to 2.50/ft for ½ to 2 in and US$2.00 to 6.00/ft for 3 to 6 in, 2026", "LatestCost, PVC pipe cost per foot", "latestcost.com"],
    ["Polycarbonate glazing", "8 mm clear twin-wall, 48 in × 8 ft, US$275 per 5-panel bundle (US$55 per panel)", "Greenhouse Megastore, 8 mm twinwall panel", "greenhousemegastore.com"],
    ["Composite reinforcement and resin", "CSM 1½ oz US$4.00/yd, woven roving 18 oz US$5.25/yd, carbon 2×2 twill US$44.50/yd, polyester resin US$34/gal, vinyl ester US$76.50/gal, epoxy kit US$97.50", "US Composites, published price list", "uscomposites.com"],
    ["Tungsten carbide", "Medium WC powder US$146.76/kg ex-VAT, Q3 2026, with WC-Co blend values by cobalt content; sintered blanks marked up for pressing, sintering and grinding", "Langsun Carbide, Q3 2026 price analysis", "langsuncarbide.com"],
    ["Machining shop rates", "3-axis CNC mill US$40 to 100/h, CNC lathe US$50 to 110/h, 5-axis US$120 to 300/h", "CNC Machines, cost to run a CNC machine per hour", "cncmachines.com"],
    ["Structural tube geometry", "Galvanised HSS mass per foot by size and wall (2×2×11 GA = 3.32 lb/ft, 3×3×¼ = 9.52 lb/ft), ASTM A500B / A513 G90", "Metals Depot, galvanised square tube", "metalsdepot.com"],
  ],
  propertiesHeading: "Property data",
  properties:
    "Density, modulus, strength, hardness, thermal and corrosion figures are handbook values typical of the grade and condition stated. They are representative, not certified: a real design must use the values on the mill certificate for the actual heat supplied, which is why MFW-CERT-CMTR exists in this catalogue.",
};

// The fine print on a printed quotation.
export const TERMS = {
  terms:
    "Prices are the catalogue's list prices in Canadian dollars and hold for the validity shown above; commodity-linked grades (stainless, nickel, aluminium and carbide in particular) would be re-quoted after that. Quantities below a stated minimum order have been raised to the minimum. Volume price breaks are applied at the tier the quantity reaches. Freight is an estimate on consolidated mass. Material certification is not included unless MFW-CERT-CMTR appears above. Delivery is ex-works from the supplier locations listed.",
  academic:
    "A teaching simulation. The suppliers are fictional and no order can be placed; the prices are anchored to published supplier and commodity data. Cite this quotation by its reference and date in your material-selection report.",
};
