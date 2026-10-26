import Image from "next/image";

import { strings } from "../strings";
import { materialPhoto } from "./material-photos";
import { MaterialSwatch } from "./material-swatch";

// The material's photograph when one is kept, and the drawn swatch when it is
// not (decision 0115). The shop's own product photograph is a different
// picture and is chosen by the caller.
const FRAME = {
  tile: "relative block h-28 w-full overflow-hidden bg-white",
  hero: "relative block aspect-[16/7] w-full overflow-hidden bg-white",
  thumb: "relative mb-2 block h-9 min-w-24 overflow-hidden rounded bg-white",
  dot: "relative block size-6 overflow-hidden rounded bg-white",
} as const;

export function MaterialTile({
  swatch,
  category,
  label,
  size = "tile",
  className,
}: {
  swatch: string;
  category?: string;
  label?: string;
  size?: "tile" | "hero" | "thumb" | "dot";
  className?: string;
}) {
  const photo = size === "dot" ? undefined : materialPhoto(swatch);
  if (!photo) {
    return (
      <MaterialSwatch swatch={swatch} category={category} label={label} size={size} className={className} />
    );
  }
  return (
    <span
      className={[FRAME[size], size === "hero" || size === "tile" ? "border border-ink/10" : "", className]
        .filter(Boolean)
        .join(" ")}
    >
      <Image
        src={photo.src}
        alt={photo.depicts}
        fill
        sizes={size === "hero" ? "(min-width: 768px) 40rem, 100vw" : size === "thumb" ? "6rem" : "(min-width: 1024px) 20rem, 50vw"}
        className="object-contain"
      />
      {label && (size === "tile" || size === "hero") ? (
        <span className="absolute bottom-2 left-2 rounded bg-paper/80 px-1.5 py-0.5 font-mono text-[0.65rem] leading-4 tracking-wide text-ink">
          {label}
        </span>
      ) : null}
    </span>
  );
}

export function PhotoCredit({ swatch, className }: { swatch: string; className?: string }) {
  const photo = materialPhoto(swatch);
  if (!photo) return null;
  const p = strings.project;
  return (
    <p className={className ?? "text-xs text-ink-muted"}>
      {photo.depicts}{" "}
      <a
        href={photo.source}
        target="_blank"
        rel="noreferrer"
        className="underline decoration-rule underline-offset-2 hover:text-ink focus-ring"
      >
        {p.photoCredit(photo.author)}
      </a>
      {photo.licenseUrl ? (
        <>
          {", "}
          <a
            href={photo.licenseUrl}
            target="_blank"
            rel="noreferrer"
            className="underline decoration-rule underline-offset-2 hover:text-ink focus-ring"
          >
            {photo.license}
          </a>
          .
        </>
      ) : (
        <>, {photo.license}.</>
      )}
    </p>
  );
}
