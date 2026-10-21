import { ProblemBody, type FigureMap } from "@/components/reading/problem-body";
import { Card } from "@/components/ui/card";

import { strings } from "../../../../strings";

// The question the worked solution answers (decision 0093). The same body the
// problem view typesets, set above the steps on a flat sheet so a derivation
// can be read against the problem it belongs to. The page owns the single h1.
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
    <Card as="section" tone="flat" aria-label={s.question} className="flex flex-col gap-3">
      <h2 className="text-xs font-medium tracking-wide text-ink-muted uppercase">{s.question}</h2>
      {title ? <p className="font-display text-2xl leading-tight">{title}</p> : null}
      <div className="max-w-[var(--measure-reading)]">
        <ProblemBody body={body} figures={figures} />
      </div>
    </Card>
  );
}
