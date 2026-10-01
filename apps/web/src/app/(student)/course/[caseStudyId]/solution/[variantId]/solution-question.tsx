import { ProblemBody, type FigureMap } from "@/components/reading/problem-body";

import { strings } from "../../../../strings";

// The question the worked solution answers (decision 0093). The same body the
// problem view typesets, set above the steps so a derivation can be read
// against the problem it belongs to. The page owns the single h1.
export function SolutionQuestion({
  title,
  body,
  figures = {},
}: {
  title: string | null;
  body: string;
  figures?: FigureMap;
}) {
  const s = strings.unfold;
  return (
    <section
      aria-label={s.question}
      className="flex flex-col gap-3 border-b border-rule-line pb-8"
    >
      <h2 className="text-xs uppercase tracking-widest text-ink-muted">{s.question}</h2>
      {title ? <p className="font-display text-2xl leading-tight">{title}</p> : null}
      <ProblemBody body={body} figures={figures} />
    </section>
  );
}
