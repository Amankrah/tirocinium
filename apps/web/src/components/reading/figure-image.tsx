"use client";

// A client component for one reason, and it is the loader below: `next/image`
// is itself a client component, and a function prop cannot cross the server
// boundary, so the loader has to be built on this side. It ships no logic worth
// the name and pulls in nothing new (next/image's runtime was already here), and
// the markdown engine around it still runs entirely on the server. The content
// model lives in `figure.ts` rather than here, because a constant exported from
// a "use client" module reaches a Server Component as a reference, not a value.
import Image from "next/image";

import { FIG_PREFIX, type FigureMap } from "./figure";

// One implementation for both the server renderer and its lazy client twin, so
// the two can never drift on the constraint they exist to honour.
export function FigureImage({
  src,
  alt,
  figures,
}: {
  src: string;
  alt?: string;
  figures: FigureMap;
}) {
  // Case study figures always arrive as fig:// tokens; a stray non-figure image
  // is not part of the content model and renders nothing.
  if (!src.startsWith(FIG_PREFIX)) return null;

  const figure = figures[src.slice(FIG_PREFIX.length)];
  if (!figure) {
    // A figure token whose pixels cannot be resolved is an error state, never a
    // silent omission (constraint 2: a figure is never omitted or substituted).
    return (
      <span className="inline-block rounded-md border border-flag-amber/40 px-3 py-2 text-sm text-flag-amber">
        Figure unavailable
      </span>
    );
  }

  return (
    <Image
      // The custom loader is the whole point (decision 0066): next/image's own
      // loader re-encodes through /_next/image, which would serve a student a
      // re-encode of the professor's diagram rather than the diagram. This hands
      // back the backend's URLs untouched, so the layout and srcSet behaviour
      // guide 2 asks for is intact and the bytes on the wire are the bytes in
      // storage. Above the intrinsic width the backend's 2x rendition answers,
      // which is exactly the high-density rule, and it is the rendition the
      // ingestion pipeline already made.
      //
      // Next warns in development that this loader "does not implement width".
      // That is expected and must not be silenced with `unoptimized`: our
      // backend serves two fixed renditions rather than arbitrary widths, and
      // `unoptimized` drops the srcSet altogether, which would lose the 2x
      // rendition guide 2 asks for. The warning is dev-only.
      loader={({ width }) =>
        figure.src2x && width > figure.width ? figure.src2x : figure.src
      }
      src={figure.src}
      width={figure.width}
      height={figure.height}
      alt={alt ?? ""}
      className="h-auto max-w-full"
    />
  );
}
