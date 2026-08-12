"use client";

// The understanding unfold (guide 4.2, milestone 8.4). A client island because
// revealing a step is an interaction and each reveal is a server round trip that
// records how far the student has read, which the tutor is then told.
//
// The steps arrive already split by the backend, deterministically and never by
// a model, so nothing here re-segments or renumbers: a step is rendered exactly
// as the professor wrote it, at the number the server gave it. It is typeset
// rather than shown as source (decision 0068), which is a rendering of that text
// and not a rewriting of it: the markdown sent into the conversation below is
// still the server's, never the rendered result.
import dynamic from "next/dynamic";
import Link from "next/link";
import { useState, type ReactNode } from "react";

import type { FigureMap } from "@/components/reading/problem-body";
import { Button } from "@/components/ui/button";
import type { Schemas } from "@/lib/api/client";
import { strings } from "../../../../strings";

// Steps already revealed on arrival are server-rendered and handed in below, so
// this loads only for a student who actually asks for another one.
const ClientProblemBody = dynamic(() =>
  import("@/components/reading/client-problem-body").then((m) => m.ClientProblemBody),
);

const s = strings.unfold;

type RevealAction = (
  variantId: number,
  throughStep: number,
) => Promise<{ unfold: Schemas["UnfoldOut"]; figures: FigureMap } | null>;

export function UnfoldPanel({
  variantId,
  initial,
  // The steps that were already out when the page rendered, typeset on the
  // server: the solution is in the HTML, readable without JavaScript, and the
  // markdown engine stays out of this route unless a step is revealed.
  initialRendered = {},
  reveal,
  // The submission the tutor would read, if this seat has one for this variant.
  defenceHref,
}: {
  variantId: number;
  initial: Schemas["UnfoldOut"];
  initialRendered?: Record<number, ReactNode>;
  reveal: RevealAction;
  defenceHref: string | null;
}) {
  const [unfold, setUnfold] = useState(initial);
  const [figures, setFigures] = useState<FigureMap>({});
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const done = unfold.steps_revealed >= unfold.total_steps;

  async function next() {
    setBusy(true);
    setFailed(false);
    // Absolute, so a double click or a retry can never rewind (decision 0049).
    const revealed = await reveal(variantId, unfold.steps_revealed + 1);
    setBusy(false);
    if (revealed) {
      setUnfold(revealed.unfold);
      setFigures(revealed.figures);
    } else setFailed(true);
  }

  return (
    <div className="flex flex-col gap-6">
      {unfold.gave_up ? (
        <p className="text-sm text-ink-muted">{s.gaveUp}</p>
      ) : null}

      <p aria-live="polite" className="text-sm text-ink-muted">
        {s.progress(unfold.steps_revealed, unfold.total_steps)}
      </p>

      <ol className="flex flex-col gap-6">
        {unfold.steps.map((step) => (
          <li key={step.number} className="flex flex-col gap-2">
            <h2 className="text-xs uppercase tracking-widest text-ink-muted">
              {s.stepLabel(step.number)}
            </h2>
            {initialRendered[step.number] ?? (
              <ClientProblemBody body={step.markdown} figures={figures} />
            )}
            {defenceHref ? (
              <Link
                // The source the server sent, not what was rendered from it, so
                // the student and the tutor discuss the same step.
                href={`${defenceHref}?step=${encodeURIComponent(step.markdown)}`}
                className="self-start text-sm text-accent-text underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {s.ask}
              </Link>
            ) : (
              <span className="text-xs text-ink-muted">{s.askUnavailable}</span>
            )}
          </li>
        ))}
      </ol>

      {failed ? (
        <p role="alert" className="text-sm text-flag-amber">
          {s.failed}
        </p>
      ) : null}

      {done ? (
        <p className="text-sm text-ink-muted">{s.complete}</p>
      ) : (
        <div>
          <Button disabled={busy} onClick={() => void next()}>
            {s.next}
          </Button>
        </div>
      )}
    </div>
  );
}
