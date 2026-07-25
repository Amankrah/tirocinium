"use client";

import "katex/dist/katex.min.css";

import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";

import type { Figure, FigureMap } from "./problem-body";

// The client twin of ProblemBody (decision 0014), for swapping a practice
// variant in place without a navigation. It is lazy-loaded, so react-markdown
// and KaTeX only reach the client when a student actually asks for a new variant
// (guide 5: the engine loads on demand); the first read is still server-rendered.
// Same rules hold: fig:// tokens resolve to the professor's pixels at their
// position, other URLs are sanitised (a variant body is generated content), and
// body headings nest beneath the page's single h1.
const FIG = "fig://";

type HastNode = { tagName?: string; children?: HastNode[] };

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

export function ClientProblemBody({
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
        urlTransform={(url) => (url.startsWith(FIG) ? url : defaultUrlTransform(url))}
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
  if (!src.startsWith(FIG)) return null;
  const figure: Figure | undefined = figures[src.slice(FIG.length)];
  if (!figure) {
    return (
      <span className="inline-block rounded-md border border-flag-amber/40 px-3 py-2 text-sm text-flag-amber">
        Figure unavailable
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={figure.src} width={figure.width} height={figure.height} alt={alt ?? ""} />
  );
}
