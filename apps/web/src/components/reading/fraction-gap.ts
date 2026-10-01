// A fraction whose denominator is itself a fraction was drawing the bar onto
// the inner numerators, and those inner fractions, set in the tighter text
// style, were drawing their own bars onto their numerators and denominators.
// The alloy density rule is the formula a student actually meets. KaTeX places
// the pieces with inline offsets after it has read the TeX, so the clearance
// is a display decision applied to that placement: the stored formula is not
// rewritten (the same rule as the equality-chain break, decision 0086).
//
// A plain fraction keeps KaTeX's own metrics. Only a fraction that sits inside
// another, and a denominator that contains one, pay for the extra room.

type HastNode = {
  type?: string;
  tagName?: string;
  properties?: {
    className?: string[] | string;
    style?: string | Record<string, string>;
  };
  children?: HastNode[];
};

// Each side of a bar that is drawn inside another fraction. Text style leaves
// about one rule thickness, which reads as the numerator sitting on the bar.
const INNER_EM = 0.45;
// Extra room under a bar whose denominator contains a fraction, beyond whatever
// the inner fraction itself grew by. The inner numerator otherwise meets the
// outer bar.
const DENOM_EM = 0.6;

// How far the outer fraction then hangs below the box KaTeX measured, per
// level of nesting. An aligned chain has to open its row gap by this much or
// the next line is drawn through the denominator.
export const NESTED_FRACTION_EXTRA_DEPTH_EM = 2 * INNER_EM + DENOM_EM;

// \left( \right) is sized before this clearance is added, so the parenthesis
// then stops short of the numerator and the denominator. The glyph is scaled
// to the fraction's new height, and a little past it: a bracket should clear
// what it encloses.
const DELIM_TIP = 0.12;

type Growth = { up: number; down: number };

const NONE: Growth = { up: 0, down: 0 };

function classList(node: HastNode): string[] {
  const names = node.properties?.className;
  if (Array.isArray(names)) return names.map(String);
  if (typeof names === "string") return names.split(/\s+/).filter(Boolean);
  return [];
}

function hasClass(node: HastNode, name: string): boolean {
  return classList(node).includes(name);
}

function readStyle(node: HastNode): Map<string, string> {
  const style = node.properties?.style;
  const raw =
    typeof style === "string"
      ? style
      : style && typeof style === "object"
        ? Object.entries(style)
            .map(([key, value]) => `${key}:${value}`)
            .join(";")
        : "";
  const map = new Map<string, string>();
  for (const part of raw.split(";")) {
    const index = part.indexOf(":");
    if (index === -1) continue;
    const key = part.slice(0, index).trim().toLowerCase();
    const value = part.slice(index + 1).trim();
    if (key) map.set(key, value);
  }
  return map;
}

function writeStyle(node: HastNode, styles: Map<string, string>) {
  node.properties = { ...node.properties, style: [...styles].map(([key, value]) => `${key}:${value}`).join(";") };
}

function parseEm(raw: string | undefined): number | null {
  if (!raw) return null;
  const match = /^(-?[\d.]+)em$/i.exec(raw.trim());
  return match ? Number(match[1]) : null;
}

function formatEm(value: number): string {
  const rounded = Math.round(value * 10000) / 10000;
  return `${rounded}em`;
}

function addEm(node: HastNode, property: string, delta: number) {
  if (delta === 0) return;
  const styles = readStyle(node);
  const current = parseEm(styles.get(property));
  if (current === null) return;
  styles.set(property, formatEm(current + delta));
  writeStyle(node, styles);
}

function elements(node: HastNode): HastNode[] {
  return (node.children ?? []).filter((child) => child.tagName);
}

function containsMfrac(node: HastNode): boolean {
  if (hasClass(node, "mfrac")) return true;
  return (node.children ?? []).some(containsMfrac);
}

type FractionParts = {
  denom: HastNode;
  numer: HastNode;
  line: HastNode | null;
  vlist: HastNode;
  depth: HastNode | null;
};

// KaTeX stacks a fraction as a vlist: denominator, bar, numerator, then a
// second row whose height is the depth below the baseline.
function fractionParts(frac: HastNode): FractionParts | null {
  const table = elements(frac).find((node) => hasClass(node, "vlist-t"));
  if (!table) return null;
  const rows = elements(table).filter((node) => hasClass(node, "vlist-r"));
  const vlist = rows[0] ? elements(rows[0]).find((node) => hasClass(node, "vlist")) : undefined;
  if (!vlist) return null;
  const kids = elements(vlist);
  const denom = kids[0];
  const numer = kids[kids.length - 1];
  if (!denom || !numer || denom === numer) return null;
  const line =
    kids.find(
      (node) =>
        node !== denom &&
        node !== numer &&
        (hasClass(node, "frac-line") || containsClass(node, "frac-line")),
    ) ?? null;
  const depthRow = rows[1];
  const depth = depthRow ? elements(depthRow).find((node) => hasClass(node, "vlist")) ?? null : null;
  return { denom, numer, line, vlist, depth };
}

function containsClass(node: HastNode, name: string): boolean {
  if (hasClass(node, name)) return true;
  return (node.children ?? []).some((child) => containsClass(child, name));
}

// Returns how far this node's box grew above and below its previous edges.
function grow(node: HastNode, insideFraction: boolean, ancestors: HastNode[]): Growth {
  if (hasClass(node, "mfrac")) return open(node, insideFraction, ancestors);
  let up = 0;
  let down = 0;
  for (const child of node.children ?? []) {
    const grew = grow(child, insideFraction, [...ancestors, node]);
    up = Math.max(up, grew.up);
    down = Math.max(down, grew.down);
  }
  return { up, down };
}

function delimiterGlyph(delim: HastNode): HastNode | null {
  const walk = (node: HastNode): HastNode | null => {
    if (hasClass(node, "delimsizing") || hasClass(node, "svg-align")) return node;
    for (const child of node.children ?? []) {
      const found = walk(child);
      if (found) return found;
    }
    return null;
  };
  return walk(delim);
}

// The parenthesis KaTeX chose for the unopened fraction. Scaling the glyph
// keeps the tips centred on the bar while the fraction grows past them.
function stretchDelimiters(ancestors: HastNode[], grown: number, original: number) {
  if (!(original > 0) || grown <= original) return;
  const minner = [...ancestors].reverse().find((node) => hasClass(node, "minner"));
  if (!minner) return;
  const scale = (grown / original) * (1 + DELIM_TIP);
  const rounded = Math.round(scale * 1000) / 1000;
  for (const delim of elements(minner)) {
    if (!hasClass(delim, "delimcenter")) continue;
    const glyph = delimiterGlyph(delim);
    if (!glyph) continue;
    const styles = readStyle(glyph);
    styles.set("display", "inline-block");
    styles.set("transform", `scaleY(${rounded})`);
    styles.set("transform-origin", "center");
    writeStyle(glyph, styles);
  }
}

function open(frac: HastNode, insideFraction: boolean, ancestors: HastNode[]): Growth {
  const parts = fractionParts(frac);
  if (!parts) return NONE;

  const denomGrowth = grow(parts.denom, true, [...ancestors, frac]);
  const numerGrowth = grow(parts.numer, true, [...ancestors, frac]);
  if (parts.line) grow(parts.line, true, [...ancestors, frac]);

  // The denominator's contents may already have grown toward the bar. Drop the
  // whole denominator by that much so the original clearance survives, then
  // add more when those contents are fractions.
  let shiftDown = denomGrowth.up;
  if (containsMfrac(parts.denom)) shiftDown += DENOM_EM;
  if (insideFraction) shiftDown += INNER_EM;

  let shiftUp = numerGrowth.down;
  if (insideFraction) shiftUp += INNER_EM;

  const heightGrow = shiftUp + numerGrowth.up;
  const depthGrow = shiftDown + denomGrowth.down;

  addEm(parts.numer, "top", -shiftUp);
  addEm(parts.denom, "top", shiftDown);
  addEm(parts.vlist, "height", heightGrow);
  if (parts.depth) addEm(parts.depth, "height", depthGrow);

  const height = parseEm(readStyle(parts.vlist).get("height")) ?? 0;
  const depth = parts.depth ? parseEm(readStyle(parts.depth).get("height")) ?? 0 : 0;
  stretchDelimiters(ancestors, height + depth, height + depth - heightGrow - depthGrow);

  return { up: heightGrow, down: depthGrow };
}

export function openFractionDenominators(tree: HastNode) {
  grow(tree, false, []);
}

export function rehypeOpenFractionDenominators() {
  return (tree: HastNode) => {
    openFractionDenominators(tree);
  };
}
