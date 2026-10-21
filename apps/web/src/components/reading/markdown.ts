import { defaultUrlTransform, type Options } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

import { rehypeBreakDisplayChains } from "./display-math";
import { FIG_PREFIX } from "./figure";
import { rehypeOpenFractionDenominators } from "./fraction-gap";
import { rehypeNativeScripts } from "./math-scripts";

// The one markdown pipeline (decision 0098). Every surface that typesets a
// professor's, a model's, or a student's markdown renders through these lists,
// so a plugin cannot be present on one surface and missing on another: that is
// the server/client drift decision 0068 warns about, and two preview surfaces
// had already drifted from the reading body by running bare KaTeX.

// Untrusted text reaches KaTeX: a transcription is the student's handwriting
// read by a model, an import is a model's reading of a PDF. `trust` stays off
// so \href, \url, and \htmlStyle are refused, and `maxSize` caps every size the
// source asks for (\rule, \kern, a row gap) so a formula cannot paint a box
// over the page. Ten em is above the widest gap the chain break writes.
export const KATEX_OPTIONS = { maxSize: 10, trust: false } as const;

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

// Math before GFM: $N_A$ and $A_{\mathrm{V}}$ are TeX subscripts. If GFM sees
// the underscore first it can treat it as emphasis and the letters land on the
// baseline as "NA" / "AV". GFM is here for tables (decision 0078).
export const remarkPlugins: Options["remarkPlugins"] = [remarkMath, remarkGfm];

// The math passes, in order: the chain break rewrites the TeX KaTeX is about to
// read (decision 0086), and the two after it adjust what KaTeX placed
// (decision 0094 and 0098).
const mathPasses: NonNullable<Options["rehypePlugins"]> = [
  rehypeBreakDisplayChains,
  [rehypeKatex, KATEX_OPTIONS],
  rehypeOpenFractionDenominators,
  rehypeNativeScripts,
];

// A preview that sits under its own headings (a transcription page, an import
// card) keeps the source's heading levels.
export const previewRehypePlugins: Options["rehypePlugins"] = mathPasses;

// The reading surfaces nest the body beneath the page's h1.
export const readingRehypePlugins: Options["rehypePlugins"] = [
  rehypeShiftHeadings,
  ...mathPasses,
];

// Preserve the fig:// scheme (sanitized away by default), but keep the default
// sanitizer for every other URL: a body can carry untrusted transcribed text,
// and a javascript: link must never survive.
export function urlTransform(url: string): string {
  return url.startsWith(FIG_PREFIX) ? url : defaultUrlTransform(url);
}

// remark-math reads only dollar delimiters, but the transcription prompts ask
// for \( \) and \[ \], and markdown reads "\(" as an escaped bracket. Those
// readings showed as "(m_1 + m_2)" with the backslashes eaten. A $$ formula
// written on one line is inline math to remark-math, set small, while the
// variant prompt and the unfold's splitter both mean it as a display. This
// rewrites the delimiters only, before parsing; the stored text, and what the
// tutor is sent, stay as written (decision 0098). Code is left alone. An import
// is normalised for good at confirmation by the backend twin of this function,
// `app/math_delimiters.py`; the two share one case table (decision 0099).
export function normalizeMath(markdown: string): string {
  const out: string[] = [];
  let prose: string[] = [];
  let fence: string | null = null;
  let inDisplay = false;
  const flush = () => {
    if (prose.length > 0) out.push(convertBrackets(prose.join("\n")));
    prose = [];
  };
  for (const line of markdown.split("\n")) {
    const trimmed = line.trim();
    if (fence !== null) {
      out.push(line);
      if (trimmed.startsWith(fence)) fence = null;
      continue;
    }
    if (inDisplay) {
      out.push(line);
      if (trimmed.endsWith("$$")) inDisplay = false;
      continue;
    }
    const opener = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (opener?.[1]) {
      flush();
      fence = opener[1];
      out.push(line);
      continue;
    }
    if (trimmed.startsWith("$$")) {
      flush();
      const single = /^\$\$(.+)\$\$$/.exec(trimmed);
      if (single?.[1] !== undefined && !single[1].includes("$$")) {
        out.push(...displayBlock(single[1], leadingSpace(line)));
      } else {
        out.push(line);
        if (!(trimmed.length > 2 && trimmed.endsWith("$$"))) inDisplay = true;
      }
      continue;
    }
    prose.push(line);
  }
  flush();
  return out.join("\n");
}

function leadingSpace(line: string): string {
  return /^\s*/.exec(line)?.[0] ?? "";
}

// The indent a display needs to stay inside the list item its line opens or
// continues; anything less ends the item.
function contentIndent(line: string): string {
  const item = /^(\s*)([-*+]|\d{1,9}[.)])(\s+)/.exec(line);
  if (item) return " ".repeat(item[0].length);
  return leadingSpace(line);
}

function displayBlock(tex: string, indent: string): string[] {
  const body = tex
    .trim()
    .split("\n")
    .map((row) => indent + row.trim());
  return ["", `${indent}$$`, ...body, `${indent}$$`, ""];
}

// Index of `close` at or after `from`, skipping escaped characters and never
// crossing a blank line (which ends the paragraph a formula belongs to), or -1.
function findUnescaped(text: string, close: string, from: number): number {
  for (let j = from; j < text.length; j++) {
    if (text.startsWith(close, j)) return j;
    if (text[j] === "\\") {
      j += 1;
      continue;
    }
    if (text[j] === "\n" && /^\n[ \t]*\n/.test(text.slice(j))) return -1;
  }
  return -1;
}

function convertBrackets(text: string): string {
  let result = "";
  let converted = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "\\") {
      const next = text[i + 1];
      if (next === "(" || next === "[") {
        const close = next === "(" ? "\\)" : "\\]";
        const end = findUnescaped(text, close, i + 2);
        if (end !== -1) {
          const tex = text.slice(i + 2, end).trim();
          if (next === "(") {
            result += `$${tex}$`;
          } else {
            const lineStart = result.lastIndexOf("\n") + 1;
            const indent = contentIndent(result.slice(lineStart));
            result = result.trimEnd();
            result += "\n" + displayBlock(tex, indent).join("\n") + "\n";
          }
          converted = true;
          i = end + 2;
          continue;
        }
      }
      // Any other escape, including "\\", is copied whole so a "\\[1em]" row
      // gap is never read as a display opening.
      result += text.slice(i, i + 2);
      i += 2;
      continue;
    }
    if (ch === "`" || ch === "$") {
      // A code span or a dollar formula is copied through untouched.
      const run = new RegExp(`^\\${ch}+`).exec(text.slice(i))?.[0] ?? ch;
      const end = findUnescaped(text, run, i + run.length);
      if (end === -1 && ch === "$") {
        // A dollar with no partner is literal (a price). Once a bracket has
        // become a dollar formula it would pair with that new dollar, so it is
        // escaped, which renders the same character.
        result += "\\$".repeat(run.length);
        i += run.length;
        continue;
      }
      const stop = end === -1 ? i + run.length : end + run.length;
      result += text.slice(i, stop);
      i = stop;
      continue;
    }
    result += ch;
    i += 1;
  }
  // Nothing converted means nothing could pair with a stray dollar, so the
  // text is returned exactly as written.
  return converted ? result : text;
}
