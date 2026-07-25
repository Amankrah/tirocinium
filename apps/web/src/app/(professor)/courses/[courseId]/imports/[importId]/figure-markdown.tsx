"use client";

import "katex/dist/katex.min.css";

import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";

import type { Schemas } from "@/lib/api/client";

// Renders an extracted item's markdown with its figures inline at their fig://
// tokens (constraint: figures are pixels from the original, rendered at their
// token position with stored intrinsic dimensions, never redrawn or
// substituted). Lazy-loaded by the review surface so react-markdown and KaTeX
// stay in their own chunk (guide 5). The markdown is untrusted model output, so
// it renders through the default URL sanitiser (fig:// preserved) with no raw
// HTML; math is the only transform.
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
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
        urlTransform={(url) => (url.startsWith(FIG) ? url : defaultUrlTransform(url))}
        components={{
          img: ({ src, alt }) => {
            const value = typeof src === "string" ? src : "";
            if (!value.startsWith(FIG)) return null;
            const figure = byId.get(value.slice(FIG.length));
            if (!figure) {
              // A token whose figure is not on the item is an error state, never
              // a silent omission (constraint: figures are never omitted).
              return (
                <span className="inline-block rounded-md border border-flag-amber/40 px-3 py-2 text-sm text-flag-amber">
                  Figure unavailable
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
                  "h-auto max-w-full rounded" +
                  (figure.role === "decorative" ? " opacity-70" : "")
                }
              />
            );
          },
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
