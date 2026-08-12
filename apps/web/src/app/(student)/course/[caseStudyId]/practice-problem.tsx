"use client";

// The practice loop's action rail and instant variant swap (frontend guide 4.1).
// The first variant is server-rendered (passed in as children); "New variant"
// asks the pool for another and swaps its body in place with the lazy client
// renderer, so the engine only loads when a student actually swaps and there is
// never a generation spinner (the pool serves instantly). "Upload solution"
// carries the current variant id into the upload flow, which is what finally
// makes that path live rather than seed-only.
import Link from "next/link";
import dynamic from "next/dynamic";
import { useState, type ReactNode } from "react";

import type { FigureMap } from "@/components/reading/problem-body";
import { Button } from "@/components/ui/button";
import type { Schemas } from "@/lib/api/client";
import { strings } from "../../strings";

const ClientProblemBody = dynamic(() =>
  import("@/components/reading/client-problem-body").then((m) => m.ClientProblemBody),
);

// The swap hands back the variant and its resolved figures together, since the
// resolve needs the seat token and cannot happen out here (decision 0066).
type SwappedVariant = {
  variant: Schemas["PracticeVariantOut"];
  figures: FigureMap;
};

type SwapAction = (
  caseStudyId: number,
  exclude: number | null,
) => Promise<SwappedVariant | null>;

type StartAttemptAction = (
  variantId: number,
) => Promise<Schemas["AttemptOut"] | null>;

export function PracticeProblem({
  caseStudyId,
  initialVariantId,
  swap,
  startAttempt,
  children,
}: {
  caseStudyId: number;
  initialVariantId: number | null;
  swap: SwapAction;
  startAttempt: StartAttemptAction;
  children: ReactNode;
}) {
  // null until the first swap; then the client-rendered current variant.
  const [current, setCurrent] = useState<SwappedVariant | null>(null);
  const [swapping, setSwapping] = useState(false);
  // The attempt this student started on the variant they are looking at
  // (decision 0058). Held only to hand to the upload; the clock is the
  // server's, and nothing here measures anything.
  const [attemptId, setAttemptId] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);
  const s = strings.problem;

  const variantId = current ? current.variant.variant_id : initialVariantId;

  async function onNewVariant() {
    setSwapping(true);
    const next = await swap(caseStudyId, variantId);
    if (next) setCurrent(next);
    setSwapping(false);
    // A fresh variant is a fresh problem, so the old attempt no longer applies:
    // the backend refuses an attempt cited from a different variant anyway, and
    // clearing it here means the student is never quietly credited for time
    // spent on a problem they swapped away from.
    setAttemptId(null);
  }

  async function onStart() {
    if (variantId === null) return;
    setStarting(true);
    const attempt = await startAttempt(variantId);
    setStarting(false);
    // A failed start costs the span and never the attempt itself: the student
    // carries on to the upload with no attempt cited, which reads as "nobody
    // recorded the start" rather than as a fabricated zero.
    if (attempt) setAttemptId(attempt.attempt_id);
  }

  const uploadHref =
    variantId === null
      ? null
      : `/course/${caseStudyId}/upload?variant=${variantId}` +
        (attemptId === null ? "" : `&attempt=${attemptId}`);

  return (
    <>
      {current === null ? (
        children
      ) : (
        <ClientProblemBody body={current.variant.body} figures={current.figures} />
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-rule-line pt-6">
        <Button onClick={() => void onNewVariant()} disabled={swapping}>
          {s.newVariant}
        </Button>
        {/* The "start attempt" moment (guide 4.2): an explicit act, not a page
            view, and never a gate on uploading. */}
        {variantId !== null && attemptId === null ? (
          <Button variant="quiet" onClick={() => void onStart()} disabled={starting}>
            {s.startAttempt}
          </Button>
        ) : null}
        {uploadHref !== null ? (
          <Link
            href={uploadHref}
            className="inline-flex items-center justify-center rounded-md bg-accent px-4 py-2 font-medium text-on-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {s.upload}
          </Link>
        ) : (
          <Button variant="quiet" disabled title={s.uploadNeedsVariant}>
            {s.upload}
          </Button>
        )}
      </div>
      {attemptId !== null ? (
        <p role="status" className="mt-2 text-sm text-ink-muted">
          {s.attemptStarted}
        </p>
      ) : null}
    </>
  );
}
