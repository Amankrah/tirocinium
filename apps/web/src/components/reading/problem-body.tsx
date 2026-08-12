import "katex/dist/katex.min.css";

import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";

import { FIG_PREFIX, type FigureMap } from "./figure";
import { FigureImage } from "./figure-image";

// The figure content model lives in `figure.ts` (decision 0066); re-exported
// here because this is where the reading surfaces reach for it.
export type { Figure, FigureMap } from "./figure";

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
// client, never the engine (decision 0014). Figures arrive already resolved:
// the caller builds the map with `resolveFigures` before rendering, because the
// resolve carries a token and belongs on the server (decision 0066).
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
