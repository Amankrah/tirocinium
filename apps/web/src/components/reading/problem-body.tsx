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

// The figure content model lives in `figure.ts` (decision 0066); re-exported
// here because this is where the reading surfaces reach for it.
export type { Figure, FigureMap } from "./figure";

// Server component: react-markdown, remark-math, and rehype-katex all run here,
// so math becomes HTML on the server and only the KaTeX stylesheet reaches the
// client, never the engine (decision 0014). Figures arrive already resolved:
// the caller builds the map with `resolveFigures` before rendering, because the
// resolve carries a token and belongs on the server (decision 0066). The
// plugins live in `markdown.ts`, shared with the client twin and the previews
// so no surface drifts from another (decision 0098).
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
