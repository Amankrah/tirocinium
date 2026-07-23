"use client";

import "katex/dist/katex.min.css";

import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";

import type { Schemas } from "@/lib/api/client";
import { strings } from "../../../strings";

// The transcription preview beside the thumbnails (frontend guide 4.1, step 4).
// Lazy-loaded by the panel, so the markdown and KaTeX engine load in their own
// chunk only when a student reaches this moment (guide 5: KaTeX loads on demand),
// keeping the upload route's initial JS lean. The recognised text is the
// student's own handwriting and is untrusted model output, so it renders through
// react-markdown's default URL sanitiser (a javascript: link never survives) and
// no raw HTML; math is the only transform.
const LOW_CONFIDENCE = 0.6;

export function TranscriptionPreview({
  pages,
  thumbnails,
}: {
  pages: Schemas["PageReadingOut"][];
  // Object URLs of the pages the student uploaded this session, by page index.
  thumbnails: string[];
}) {
  const s = strings.upload;
  return (
    <section className="flex flex-col gap-8">
      {pages.map((page) => {
        const uncertain = page.regions.filter((r) => r.confidence < LOW_CONFIDENCE);
        const thumb = thumbnails[page.page_index];
        return (
          <article
            key={page.page_index}
            className="flex flex-col gap-3 sm:flex-row sm:gap-4"
          >
            {thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={thumb}
                alt=""
                className="h-44 w-32 shrink-0 rounded border border-rule-line object-cover"
              />
            ) : null}
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <h3 className="text-sm text-ink-muted">
                {s.pageLabel(page.page_index + 1)}
              </h3>
              <div className="reading-body text-sm">
                <ReactMarkdown
                  remarkPlugins={[remarkMath]}
                  rehypePlugins={[rehypeKatex]}
                  urlTransform={defaultUrlTransform}
                  // No images in a handwriting transcription; drop any the model
                  // emitted rather than fetch an arbitrary URL.
                  components={{ img: () => null }}
                >
                  {page.markdown}
                </ReactMarkdown>
              </div>
              {uncertain.length > 0 ? (
                <div className="rounded-md border border-flag-amber/40 p-3">
                  <p className="text-xs text-flag-amber">{s.checkSpans}</p>
                  <ul className="mt-1 flex flex-col gap-1">
                    {uncertain.map((region, i) => (
                      <li key={i} className="text-sm text-ink">
                        <mark className="rounded bg-flag-amber/15 px-1">
                          {region.text}
                        </mark>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </article>
        );
      })}
    </section>
  );
}
