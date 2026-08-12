// The figure content model, in a plain module on purpose. `figure-image.tsx`
// has to be a client component (next/image's loader is a function prop), and a
// value imported from a "use client" module into a Server Component arrives as
// a client reference rather than the value: the token prefix below is read by
// the server renderer's urlTransform, so it cannot live over there. Types would
// be fine either way, since they are erased; the constant is not.

// A figure as the reading surfaces need it: the pixels from the professor's
// original (constraint 2: never redrawn, substituted, or re-encoded), with the
// stored intrinsic dimensions so it never causes layout shift (guide 2), and the
// backend's own 2x rendition for high-density screens. Keyed by the id in its
// `fig://{id}` token, which sits at the figure's position in the markdown. The
// map is built server-side by `lib/api/figures.ts` (decision 0066).
export type Figure = {
  src: string;
  src2x?: string | null;
  width: number;
  height: number;
};

export type FigureMap = Record<string, Figure>;

export const FIG_PREFIX = "fig://";
