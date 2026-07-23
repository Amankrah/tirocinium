import "katex/dist/katex.min.css";

import Image from "next/image";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";

// A figure as the reading surface needs it: the pixels from the professor's
// original (constraint: figures are never redrawn or substituted), with the
// stored intrinsic dimensions so it never causes layout shift (guide 2). Keyed
// by the id in its fig://{id} token, which sits at the figure's position in the
// markdown body. Ingestion (Phase 4) will supply these; until then they are
// seeded, which is how 2.3 proves figure rendering before ingestion exists
// (decision 0014).
export type Figure = {
  src: string;
  width: number;
  height: number;
};

export type FigureMap = Record<string, Figure>;

const FIG_PREFIX = "fig://";

type HastNode = { tagName?: string; children?: HastNode[] };

// The page owns the single h1 (the case study title), so the body's own
// markdown headings nest beneath it: a body "# ..." becomes an h2, and so on.
// This keeps one top-level heading per document, which is what the outline and
// assistive technology expect. Dependency-free so no plugin has to be trusted.
function rehypeShiftHeadings() {
  return (tree: HastNode) => {
    const walk = (node: HastNode) => {
      if (node.tagName && /^h[1-5]$/.test(node.tagName)) {
        node.tagName = `h${Number(node.tagName[1]) + 1}`;
      }
      node.children?.forEach(walk);
    };
    walk(tree);
  };
}

// Server component: react-markdown, remark-math, and rehype-katex all run here,
// so math becomes HTML on the server and only the KaTeX stylesheet reaches the
// client, never the engine (decision 0014).
export function ProblemBody({
  body,
  figures = {},
}: {
  body: string;
  figures?: FigureMap;
}) {
  return (
    <div className="reading-body">
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeShiftHeadings, rehypeKatex]}
        // Preserve the fig:// scheme (sanitized away by default), but keep the
        // default sanitizer for every other URL: a case study body can carry
        // untrusted transcribed text, and a javascript: link must never survive.
        urlTransform={(url) =>
          url.startsWith(FIG_PREFIX) ? url : defaultUrlTransform(url)
        }
        components={{
          img: ({ src, alt }) => (
            <FigureImage
              src={typeof src === "string" ? src : ""}
              alt={alt}
              figures={figures}
            />
          ),
        }}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}

function FigureImage({
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
    // silent omission (constraint: figures are never omitted or substituted).
    return (
      <span className="inline-block rounded-md border border-flag-amber/40 px-3 py-2 text-sm text-flag-amber">
        Figure unavailable
      </span>
    );
  }

  return (
    <Image
      src={figure.src}
      width={figure.width}
      height={figure.height}
      alt={alt ?? ""}
    />
  );
}
