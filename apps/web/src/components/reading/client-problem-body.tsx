"use client";

import "katex/dist/katex.min.css";

import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";

import { FIG_PREFIX, type FigureMap } from "./figure";
import { FigureImage } from "./figure-image";

// The client twin of ProblemBody (decision 0014), for swapping a practice
// variant in place without a navigation. It is lazy-loaded, so react-markdown
// and KaTeX only reach the client when a student actually asks for a new variant
// (guide 5: the engine loads on demand); the first read is still server-rendered.
// Same rules hold, and the figure renderer is literally the same component
// (decision 0066): fig:// tokens resolve to the professor's pixels at their
// position, other URLs are sanitised (a variant body is generated content), and
// body headings nest beneath the page's single h1.
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
