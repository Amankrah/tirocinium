import type { ReactNode } from "react";

import { motifFor, swatchBackground, swatchIsLight, type Motif } from "./swatches";

// A material as a picture (decision 0106): the catalogue's swatch as a tile,
// with the form the category comes in drawn over it as a line motif, and an
// optional label in the corner. Decoration by contract: the line's name and
// category stand beside it as text, so the tile is hidden from assistive
// technology and never focusable. Server-compatible; both marketplaces use
// it. The one place a colour is not a token is the material itself, which is
// content (see swatches.ts).
const MOTIF_PATHS: Record<Motif, ReactNode> = {
  sheet: (
    <>
      <path d="M8 22 L24 12 L40 22 L24 32 Z" />
      <path d="M8 22 V28 L24 38 L40 28 V22" />
    </>
  ),
  tube: (
    <>
      <rect x="10" y="10" width="28" height="28" rx="3" />
      <rect x="16" y="16" width="16" height="16" rx="2" />
    </>
  ),
  bar: (
    <>
      <circle cx="24" cy="24" r="13" />
      <path d="M11 24 H37" opacity=".5" />
    </>
  ),
  pipe: (
    <>
      <circle cx="24" cy="24" r="14" />
      <circle cx="24" cy="24" r="9" />
    </>
  ),
  weave: (
    <>
      <path d="M10 16 H38 M10 24 H38 M10 32 H38" />
      <path d="M16 10 V38 M24 10 V38 M32 10 V38" />
    </>
  ),
  drop: <path d="M24 9 C30 18 34 23 34 28 a10 10 0 0 1 -20 0 c0-5 4-10 10-19Z" />,
  grate: (
    <>
      <rect x="9" y="9" width="30" height="30" rx="2" />
      <path d="M19 9 V39 M29 9 V39 M9 19 H39 M9 29 H39" />
    </>
  ),
  panel: (
    <>
      <rect x="9" y="13" width="30" height="22" rx="2" />
      <path d="M9 20 H39" opacity=".5" />
    </>
  ),
  gear: (
    <>
      <circle cx="24" cy="24" r="7" />
      <path d="M24 9 v5 M24 34 v5 M9 24 h5 M34 24 h5 M13.4 13.4 l3.5 3.5 M31.1 31.1 l3.5 3.5 M13.4 34.6 l3.5-3.5 M31.1 16.9 l3.5-3.5" />
    </>
  ),
  flame: <path d="M24 10 c2 6 8 9 8 17 a8 8 0 0 1 -16 0 c0-4 2-6 3-8 c0 3 1 5 3 5 c2-3 1-9 2-14Z" />,
  lens: (
    <>
      <circle cx="21" cy="21" r="9" />
      <path d="M28 28 l9 9" />
    </>
  ),
  arc: (
    <>
      <path d="M10 30 Q24 10 38 30" />
      <path d="M18 34 l3-6 M30 34 l-3-6" />
    </>
  ),
  none: null,
};

export function MaterialSwatch({
  swatch,
  category,
  label,
  size = "tile",
  className,
}: {
  swatch: string;
  category?: string;
  // A short mono caption in the corner, usually the category.
  label?: string;
  // tile: the top of a card; hero: the line page; thumb: a column header;
  // dot: inline beside a name.
  size?: "tile" | "hero" | "thumb" | "dot";
  className?: string;
}) {
  const motif = category ? motifFor(category) : "none";
  const light = swatchIsLight(swatch);
  const ink = light ? "rgba(22,26,35,.55)" : "rgba(250,250,247,.7)";
  const sizes = {
    tile: "h-28 w-full rounded-md",
    hero: "aspect-[16/7] w-full rounded-lg",
    thumb: "h-9 w-full rounded",
    dot: "size-6 shrink-0 rounded",
  } as const;
  const motifSize = size === "hero" ? 72 : size === "tile" ? 40 : size === "thumb" ? 20 : 0;
  return (
    <span
      aria-hidden="true"
      className={[
        "relative block overflow-hidden border border-ink/10 shadow-[inset_0_1px_0_rgba(255,255,255,.25)]",
        sizes[size],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ backgroundImage: swatchBackground(swatch) }}
    >
      {motifSize > 0 && motif !== "none" ? (
        <svg
          width={motifSize}
          height={motifSize}
          viewBox="0 0 48 48"
          fill="none"
          stroke={ink}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
          focusable="false"
        >
          {MOTIF_PATHS[motif]}
        </svg>
      ) : null}
      {label && (size === "tile" || size === "hero") ? (
        <span
          className={
            "absolute bottom-2 left-2 rounded px-1.5 py-0.5 font-mono text-[0.65rem] leading-4 tracking-wide " +
            (light ? "bg-paper/80 text-ink" : "bg-ink/55 text-paper")
          }
        >
          {label}
        </span>
      ) : null}
    </span>
  );
}
