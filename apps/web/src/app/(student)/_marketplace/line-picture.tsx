"use client";

// The shop's product photograph when the line is that product. Otherwise the
// material photograph, and the drawn swatch when there is none (decision 0115).
import Image from "next/image";
import { useState } from "react";

import { MaterialTile, PhotoCredit } from "./material-tile";

export function LinePicture({
  image,
  href,
  credit,
  name,
  swatch,
  category,
}: {
  image: string | null;
  href: string;
  credit: string;
  name: string;
  swatch: string;
  category: string;
}) {
  const [failed, setFailed] = useState(false);
  if (!image || failed) {
    return (
      <figure className="flex flex-col gap-1.5">
        <MaterialTile
          swatch={swatch}
          category={category}
          label={category}
          size="hero"
          className="rounded-lg"
        />
        <PhotoCredit swatch={swatch} />
      </figure>
    );
  }
  return (
    <figure className="overflow-hidden rounded-lg border border-ink/10 bg-white">
      <div className="relative aspect-[16/7] w-full bg-white">
        <Image
          src={image}
          alt={name}
          fill
          sizes="(min-width: 768px) 40rem, 100vw"
          className="object-contain"
          onError={() => setFailed(true)}
        />
      </div>
      <figcaption className="px-3 py-1.5 text-xs text-ink-muted">
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="underline decoration-rule underline-offset-2 hover:text-ink focus-ring"
        >
          {credit}
        </a>
      </figcaption>
    </figure>
  );
}
