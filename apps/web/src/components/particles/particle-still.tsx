// The resolved state, as a still (frontend guide 3.3, rule 4). One SVG, drawn
// from the same curve the GPU resolves into, so this is genuinely the resolved
// moment held still rather than a different picture that stands in for it.
//
// It serves two cases that want exactly the same thing: a student who has asked
// for reduced motion, and a device without WebGL2. Decoration throughout, so it
// is aria-hidden and never focusable. Two paths, the wash under the curve and
// the curve itself, which the particle-hero journey counts.
import { curvePath } from "@/lib/particles/shape";

const WIDTH = 1_200;
const HEIGHT = 400;

export function ParticleStill() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="xMidYMax slice"
      className="pointer-events-none absolute inset-0 -z-10 h-full w-full"
    >
      {/* Ink, not accent: the GPU field draws in ink, and accent-at-10% on
          paper is a wash you cannot see. Ink inverts with the theme, so this
          is the same graphite-on-paper / chalk-on-ground the particles are.
          The wash is faint (decision 0102): a filled slab read as a hill,
          not a distribution, and crowded the copy sitting on it. */}
      <path
        d={`${curvePath(WIDTH, HEIGHT)} L ${WIDTH} ${HEIGHT} L 0 ${HEIGHT} Z`}
        className="fill-ink/[0.04]"
      />
      <path
        d={curvePath(WIDTH, HEIGHT)}
        fill="none"
        className="stroke-ink/30"
        strokeWidth={1.5}
        strokeDasharray="4 6"
        strokeLinecap="round"
      />
    </svg>
  );
}
