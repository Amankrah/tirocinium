"use client";

import "katex/dist/katex.min.css";

import ReactMarkdown from "react-markdown";

import { type FigureMap } from "./figure";
import { FigureImage } from "./figure-image";
import {
  normalizeMath,
  readingRehypePlugins,
  remarkPlugins,
  urlTransform,
} from "./markdown";

// The client twin of ProblemBody (decision 0014), for swapping a practice
// variant in place without a navigation. It is lazy-loaded, so react-markdown
// and KaTeX only reach the client when a student actually asks for a new variant
// (guide 5: the engine loads on demand); the first read is still server-rendered.
// Same rules hold, and the figure renderer is literally the same component
// (decision 0066): fig:// tokens resolve to the professor's pixels at their
// position, other URLs are sanitised (a variant body is generated content), and
// body headings nest beneath the page's single h1. The plugin lists are the
// same objects ProblemBody uses (decision 0098), so the twins cannot drift.
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
        remarkPlugins={remarkPlugins}
        rehypePlugins={readingRehypePlugins}
        urlTransform={urlTransform}
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
        {normalizeMath(body)}
      </ReactMarkdown>
    </div>
  );
}
