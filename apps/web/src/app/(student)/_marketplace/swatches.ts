// The catalogue's material art (decision 0106). Every line in a catalogue
// names a swatch, and this is what each swatch looks like: a CSS background
// that reads as the material (brushed stainless, galvanised spangle, a flax
// weave, a carbide grey), carried over from the BREE 216 prototype that the
// catalogue descends from. These are content, like a figure in a problem,
// not interface colour: the token layer still owns every pixel of chrome
// around them, and a tile is decoration beside a name, never the only thing
// that says what a line is. A swatch the catalogue names and this file
// lacks falls back to the family's neutral, and a test over the shipped
// catalogue says when that happens.
//
// Both marketplaces share this module, as they share the catalogue.

export const SWATCHES: Record<string, string> = {
  hrsteel: "linear-gradient(135deg,#6f7276 0%,#8c8f93 22%,#5c5f63 48%,#83868a 72%,#63666a 100%)",
  cdsteel: "linear-gradient(120deg,#9a9da1 0%,#c2c5c9 28%,#8d9094 55%,#b4b7bb 78%,#94979b 100%)",
  arplate: "linear-gradient(135deg,#4a4d52 0%,#63666b 30%,#3d4045 60%,#585b60 100%)",
  alloy: "linear-gradient(135deg,#5f6266 0%,#7d8084 25%,#4e5155 55%,#75787c 85%,#5a5d61 100%)",
  spring: "linear-gradient(100deg,#4d4f54 0%,#75777c 20%,#3f4146 45%,#6b6d72 70%,#494b50 100%)",
  galv: "linear-gradient(135deg,#b9bec4 0%,#dde2e7 18%,#a7acb3 34%,#ced3d9 52%,#9ea3aa 68%,#d6dbe1 86%,#b2b7be 100%)",
  stain: "linear-gradient(90deg,#c6cace 0%,#e3e7ea 12%,#b9bdc2 24%,#dfe3e6 36%,#c1c5c9 48%,#e6eaed 60%,#bcc0c5 72%,#dde1e4 84%,#c4c8cc 100%)",
  stainbr: "repeating-linear-gradient(90deg,#c9cdd1 0 2px,#dee2e5 2px 3px,#bcc0c4 3px 5px)",
  duplex: "linear-gradient(115deg,#aeb6bb 0%,#cdd4d8 25%,#9ba3a9 50%,#c3cad0 75%,#a6aeb4 100%)",
  nickel: "linear-gradient(135deg,#b0aa9a 0%,#d2ccbb 25%,#9d9787 50%,#c6c0af 75%,#a9a393 100%)",
  tita: "linear-gradient(135deg,#8f9296 0%,#adb0b4 30%,#7c7f83 60%,#a2a5a9 100%)",
  alum: "linear-gradient(120deg,#c4c8cd 0%,#e6eaee 22%,#b5b9be 46%,#dadee2 70%,#c0c4c9 100%)",
  alumext: "repeating-linear-gradient(115deg,#c9cdd2 0 6px,#dfe3e7 6px 9px,#bec2c7 9px 14px)",
  castiron: "linear-gradient(135deg,#4c4a48 0%,#615f5c 28%,#3e3c3a 55%,#575552 80%,#454341 100%)",
  corten: "linear-gradient(135deg,#7a4a2d 0%,#9c6440 25%,#6a3d24 50%,#8d5836 75%,#734427 100%)",
  rebar: "repeating-linear-gradient(60deg,#6b5f52 0 7px,#89796a 7px 10px,#5d5247 10px 16px)",
  hdpe: "linear-gradient(135deg,#26292d 0%,#3a3e43 30%,#1d2024 60%,#33373b 100%)",
  pvcw: "linear-gradient(135deg,#e9ecef 0%,#fbfcfd 25%,#dde1e5 55%,#f2f4f6 80%,#e4e7ea 100%)",
  pvcg: "linear-gradient(135deg,#5f6f6a 0%,#7d8d87 28%,#4f5f5a 58%,#71817b 100%)",
  cpvc: "linear-gradient(135deg,#d8cfa8 0%,#eee6c4 28%,#cbc199 58%,#e4dcb8 100%)",
  pex: "linear-gradient(135deg,#a83c3c 0%,#c85656 30%,#8f2f2f 60%,#bb4c4c 100%)",
  pp: "linear-gradient(135deg,#dfe3e0 0%,#f4f7f5 28%,#d2d6d3 58%,#eaeeeb 100%)",
  uhmw: "linear-gradient(135deg,#e4e7e4 0%,#f7faf8 22%,#d7dad7 50%,#eff2f0 78%,#e0e3e0 100%)",
  pc: "linear-gradient(135deg,rgba(154,196,206,.85) 0%,rgba(214,238,243,.9) 25%,rgba(133,178,190,.85) 55%,rgba(196,226,233,.9) 100%),repeating-linear-gradient(90deg,#7fa6b0 0 1px,transparent 1px 13px)",
  pcsolid: "linear-gradient(135deg,rgba(180,214,222,.75) 0%,rgba(226,243,247,.85) 30%,rgba(163,199,208,.75) 65%,rgba(212,235,240,.85) 100%)",
  acryl: "linear-gradient(135deg,rgba(226,236,240,.9) 0%,rgba(248,252,253,.95) 30%,rgba(210,224,229,.9) 65%,rgba(240,247,249,.95) 100%)",
  film: "linear-gradient(135deg,rgba(232,240,236,.8) 0%,rgba(250,253,251,.9) 30%,rgba(219,229,224,.8) 70%,rgba(243,248,245,.9) 100%)",
  epdm: "linear-gradient(135deg,#1f2225 0%,#303438 32%,#17191c 62%,#2a2d31 100%)",
  ptfe: "linear-gradient(135deg,#f0f2f0 0%,#ffffff 25%,#e3e6e3 55%,#f7f9f7 100%)",
  nylon: "linear-gradient(135deg,#d9d2bd 0%,#efe9d8 28%,#cbc4ad 58%,#e5dfcd 100%)",
  glassf: "repeating-linear-gradient(45deg,#eceee9 0 4px,#dfe2db 4px 8px),repeating-linear-gradient(-45deg,rgba(255,255,255,.5) 0 4px,transparent 4px 8px)",
  csm: "radial-gradient(circle at 30% 30%,#f2f3ef,#dcdfd7),repeating-linear-gradient(22deg,rgba(190,195,182,.35) 0 2px,transparent 2px 9px)",
  flax: "repeating-linear-gradient(45deg,#c7ab74 0 5px,#b39760 5px 10px),repeating-linear-gradient(-45deg,rgba(255,248,230,.45) 0 5px,transparent 5px 10px)",
  hemp: "repeating-linear-gradient(30deg,#b3a071 0 4px,#9d8a5d 4px 8px)",
  jute: "repeating-linear-gradient(0deg,#b99a63 0 3px,#a68851 3px 6px),repeating-linear-gradient(90deg,rgba(255,246,222,.4) 0 3px,transparent 3px 6px)",
  carbonf: "repeating-linear-gradient(45deg,#1d2023 0 5px,#2e3236 5px 10px),repeating-linear-gradient(-45deg,rgba(255,255,255,.06) 0 5px,transparent 5px 10px)",
  basalt: "repeating-linear-gradient(45deg,#4e4a52 0 4px,#3d3a41 4px 8px)",
  resin: "linear-gradient(135deg,#c9a96b 0%,#e6cb92 25%,#b59657 55%,#dcc086 100%)",
  bioresin: "linear-gradient(135deg,#8d9a5b 0%,#adba77 28%,#7a8750 58%,#a2af6e 100%)",
  frp: "linear-gradient(135deg,#3f5f4a 0%,#547a60 28%,#35513f 58%,#4c6f57 100%)",
  frpgrate: "repeating-linear-gradient(0deg,#3f5f4a 0 8px,#e8ece7 8px 11px),repeating-linear-gradient(90deg,#3f5f4a 0 8px,rgba(232,236,231,.9) 8px 11px)",
  foam: "linear-gradient(135deg,#e5c98f 0%,#f2ddad 30%,#d8ba7c 65%,#ecd5a2 100%)",
  balsa: "repeating-linear-gradient(90deg,#d9c095 0 6px,#c9ad7e 6px 7px)",
  strawb: "repeating-linear-gradient(28deg,#c2a86f 0 3px,#d5bd85 3px 6px,#b39a5f 6px 10px)",
  hempcr: "linear-gradient(135deg,#cfc7b0 0%,#e2dcc9 28%,#bdb49c 58%,#d7d0bd 100%)",
  carbide: "linear-gradient(135deg,#3a3d42 0%,#54585e 22%,#2d3035 50%,#4a4e54 78%,#35383d 100%)",
  toolst: "linear-gradient(135deg,#55585d 0%,#71747a 25%,#45484d 55%,#666970 85%,#4e5156 100%)",
  hss: "linear-gradient(135deg,#6a6d73 0%,#8a8d93 25%,#585b61 55%,#7d8086 100%)",
  stellite: "linear-gradient(135deg,#9aa2a8 0%,#bcc4ca 25%,#878f95 55%,#adb5bb 100%)",
  alumina: "linear-gradient(135deg,#f0ece4 0%,#fdfbf7 25%,#e3ded4 55%,#f7f4ee 100%)",
  sic: "linear-gradient(135deg,#2b2f33 0%,#42474c 25%,#212528 55%,#383c41 100%)",
  zirc: "linear-gradient(135deg,#ede9e3 0%,#fbf8f4 25%,#ded9d1 55%,#f4f1eb 100%)",
  si3n4: "linear-gradient(135deg,#8c8778 0%,#a8a394 25%,#787365 55%,#9b9687 100%)",
  tin: "linear-gradient(135deg,#a8862a 0%,#d4ad45 25%,#8e701f 55%,#c39c38 100%)",
  dlc: "linear-gradient(135deg,#15181b 0%,#262a2e 25%,#0e1113 55%,#1f2225 100%)",
  chrome: "linear-gradient(105deg,#cfd6dc 0%,#f2f6f9 15%,#b8bfc6 32%,#e7ecf0 50%,#c2c9d0 68%,#eff3f6 85%,#ccd3d9 100%)",
  svc: "linear-gradient(135deg,#3b4450 0%,#525c6a 30%,#2f3843 60%,#48525f 100%)",
  svcw: "linear-gradient(135deg,#5a4030 0%,#7d5a42 28%,#4a3327 58%,#6c4d38 100%)",
  svcht: "linear-gradient(135deg,#8c3418 0%,#c25a2b 26%,#e08a3c 48%,#a8451f 72%,#7a2c13 100%)",
  svcqa: "linear-gradient(135deg,#2f4858 0%,#436073 28%,#253946 58%,#3a5364 100%)",
};

/** The background for a swatch key; an unknown key reads as plain steel. */
export function swatchBackground(key: string): string {
  return SWATCHES[key] ?? SWATCHES.hrsteel!;
}

// Whether the material is light enough that a label or motif on it should be
// drawn in ink rather than in paper. Decided per swatch rather than computed,
// because a gradient has no single luminance and the eye settles it in a
// moment.
const LIGHT = new Set([
  "galv", "stain", "stainbr", "duplex", "nickel", "alum", "alumext", "pvcw", "cpvc", "pp", "uhmw",
  "pc", "pcsolid", "acryl", "film", "ptfe", "nylon", "glassf", "csm", "flax", "hemp", "jute",
  "resin", "foam", "balsa", "strawb", "hempcr", "stellite", "alumina", "zirc", "chrome", "cdsteel",
  "tita", "si3n4",
]);

export function swatchIsLight(key: string): boolean {
  return LIGHT.has(key);
}

// The form a category comes in, drawn as a small line motif over the
// material so a plate, a tube, a bar, a pipe, a weave and a service read at a
// glance in a grid of tiles. A category this map does not know shows the
// material alone.
export type Motif = "sheet" | "tube" | "bar" | "pipe" | "weave" | "drop" | "grate" | "panel" | "gear" | "flame" | "lens" | "arc" | "none";

const MOTIFS: Record<string, Motif> = {
  "Plate & sheet": "sheet",
  "Sheet stock": "sheet",
  "Wear plate": "sheet",
  "Glazing": "sheet",
  "Geomembrane & film": "sheet",
  "Aluminium": "sheet",
  "Bar stock": "bar",
  "Cast & specialty": "bar",
  "Fasteners": "bar",
  "Structural tube": "tube",
  "Sanitary tube & fittings": "pipe",
  "HDPE pipe": "pipe",
  "PVC & CPVC": "pipe",
  "Glass reinforcement": "weave",
  "Natural fibre": "weave",
  "Resins": "drop",
  "Surface coatings": "drop",
  "Pultruded & panel": "grate",
  "Core materials": "panel",
  "Technical ceramics": "panel",
  "Cemented carbide": "panel",
  "Tool steel": "bar",
  "Hardfacing": "arc",
  "Welding": "arc",
  "Heat treatment": "flame",
  "Machining": "gear",
  "Cutting": "gear",
  "Tooling": "gear",
  "Finishing & coating": "drop",
  "Inspection": "lens",
  "Austenitic 300-series": "sheet",
  "Duplex": "sheet",
  "Nickel & titanium": "sheet",
};

export function motifFor(category: string): Motif {
  return MOTIFS[category] ?? "none";
}
