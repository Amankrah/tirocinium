"use client";

import "katex/dist/katex.min.css";

import ReactMarkdown from "react-markdown";

import {
  normalizeMath,
  previewRehypePlugins,
  remarkPlugins,
  urlTransform,
} from "@/components/reading/markdown";
import type { Schemas } from "@/lib/api/client";
import { strings } from "../../../../strings";

// Renders an extracted item's markdown with its figures inline at their fig://
// tokens (constraint: figures are pixels from the original, rendered at their
// token position with stored intrinsic dimensions, never redrawn or
// substituted). Lazy-loaded by the review surface so react-markdown and KaTeX
// stay in their own chunk (guide 5). The markdown is untrusted model output, so
// it renders through the default URL sanitiser (fig:// preserved) with no raw
// HTML. The pipeline is the reading body's (decision 0098), so a professor
// confirms the problem as the student will read it.
const FIG = "fig://";

export function FigureMarkdown({
  markdown,
  figures,
}: {
  markdown: string;
  figures: Schemas["ItemFigureOut"][];
}) {
  const byId = new Map(figures.map((f) => [String(f.figure_id), f]));
  return (
    <div className="reading-body text-sm">
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={previewRehypePlugins}
        urlTransform={urlTransform}
        components={{
          img: ({ src, alt }) => {
            const value = typeof src === "string" ? src : "";
            if (!value.startsWith(FIG)) return null;
            const figure = byId.get(value.slice(FIG.length));
            if (!figure) {
              // A token whose figure is not on the item is an error state, never
              // a silent omission (constraint: figures are never omitted).
              return (
                <span className="inline-block rounded-md border border-flag-amber/40 bg-flag-amber-soft px-3 py-2 text-sm text-flag-amber">
                  {strings.confirm.figureUnavailable}
                </span>
              );
            }
            return (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={figure.image_url}
                width={figure.width_px}
                height={figure.height_px}
                alt={alt ?? figure.caption ?? ""}
                className={
                  "h-auto max-w-full rounded-md" +
                  (figure.role === "decorative" ? " opacity-70" : "")
                }
              />
            );
          },
        }}
      >
        {normalizeMath(markdown)}
      </ReactMarkdown>
    </div>
  );
}
