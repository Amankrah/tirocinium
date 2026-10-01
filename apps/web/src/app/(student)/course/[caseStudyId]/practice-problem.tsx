"use client";

// The practice loop's action rail and instant variant swap (frontend guide 4.1).
// The first variant is server-rendered (passed in as children); "New variant"
// asks the pool for another and swaps its body in place with the lazy client
// renderer, so the engine only loads when a student actually swaps and there is
// never a generation spinner (the pool serves instantly). "Start working"
// records the attempt and opens the writing page for this variant (decision
// 0080). That page is also where photos and a PDF are added, so the problem
// view does not offer a second control to it (decision 0084). "See the
// solution" opens the whole worked solution at once, and is temporary
// (decision 0085).
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
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

type OpenSolutionAction = (variantId: number) => Promise<boolean>;

export function PracticeProblem({
  caseStudyId,
  initialVariantId,
  pricesMaterials,
  swap,
  startAttempt,
  openSolution,
  children,
}: {
  caseStudyId: number;
  initialVariantId: number | null;
  // Whether this course quotes for materials (Phase 10). Most do not, and the
  // link is absent rather than disabled for them: a dead control is a worse
  // answer than no control.
  pricesMaterials: boolean;
  swap: SwapAction;
  startAttempt: StartAttemptAction;
  // Temporary (decision 0085): opens every step of the worked solution.
  openSolution: OpenSolutionAction;
  children: ReactNode;
}) {
  // null until the first swap; then the client-rendered current variant.
  const [current, setCurrent] = useState<SwappedVariant | null>(null);
  const [swapping, setSwapping] = useState(false);
  // Set when the pool had nothing else to give, so the student is told rather
  // than left looking at an unchanged problem (decision 0088).
  const [poolDry, setPoolDry] = useState(false);
  // The attempt this student started on the variant they are looking at
  // (decision 0058). Held only to hand to the upload; the clock is the
  // server's, and nothing here measures anything.
  const [attemptId, setAttemptId] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);
  const [openingSolution, setOpeningSolution] = useState(false);
  const [solutionFailed, setSolutionFailed] = useState(false);
  const router = useRouter();
  const s = strings.problem;

  const variantId = current ? current.variant.variant_id : initialVariantId;

  async function onNewVariant() {
    setSwapping(true);
    setPoolDry(false);
    const next = await swap(caseStudyId, variantId);
    // A dry pool answers with the base problem and a null id rather than making
    // the student wait (the 5.4 pool invariant). Swapping that in would replace
    // the problem with the identical text and, because the upload needs a
    // variant to file against, silently take the upload link away: a control
    // that looks broken and removes an unrelated one as it goes. So keep what
    // is on screen, and say why nothing changed.
    if (next && next.variant.variant_id !== null) setCurrent(next);
    else setPoolDry(true);
    setSwapping(false);
    // A fresh variant is a fresh problem, so the old attempt no longer applies:
    // the backend refuses an attempt cited from a different variant anyway, and
    // clearing it here means the student is never quietly credited for time
    // spent on a problem they swapped away from. A swap that found nothing
    // changed no problem, so it clears nothing either.
    if (next && next.variant.variant_id !== null) setAttemptId(null);
  }

  async function onStart() {
    if (variantId === null) return;
    setStarting(true);
    const attempt = await startAttempt(variantId);
    setStarting(false);
    // A failed start costs the span and never the work itself: the student
    // still opens the page, with no attempt cited, which reads as "nobody
    // recorded the start" rather than as a fabricated zero (decision 0058).
    const started = attempt?.attempt_id ?? null;
    if (started !== null) setAttemptId(started);
    const attemptQuery = started === null ? "" : `&attempt=${started}`;
    router.push(
      `/course/${caseStudyId}/upload?variant=${variantId}${attemptQuery}`,
    );
  }

  async function onSeeSolution() {
    if (variantId === null) return;
    setOpeningSolution(true);
    setSolutionFailed(false);
    const opened = await openSolution(variantId);
    setOpeningSolution(false);
    if (opened) {
      router.push(`/course/${caseStudyId}/solution/${variantId}`);
    } else {
      setSolutionFailed(true);
    }
  }

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
        {/* The "start attempt" moment (guide 4.2, decision 0080): an explicit
            act that opens the page where the solution is written or added.
            A failed start still opens that page, so the clock never gates the
            work (decision 0058). */}
        {variantId !== null && attemptId === null ? (
          <Button onClick={() => void onStart()} disabled={starting}>
            {s.startAttempt}
          </Button>
        ) : null}
        {variantId === null ? (
          <p className="text-sm text-ink-muted">{s.uploadNeedsVariant}</p>
        ) : null}
        {variantId !== null ? (
          <Button
            variant="quiet"
            onClick={() => void onSeeSolution()}
            disabled={openingSolution}
          >
            {s.seeSolution}
          </Button>
        ) : null}
        {pricesMaterials && variantId !== null ? (
          <Link
            href={`/course/${caseStudyId}/marketplace?variant=${variantId}`}
            className="inline-flex items-center justify-center rounded-md px-4 py-2 font-medium text-ink hover:bg-rule-line/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {s.price}
          </Link>
        ) : null}
      </div>
      {poolDry ? (
        <p role="status" className="mt-2 text-sm text-ink-muted">
          {s.onlyVariant}
        </p>
      ) : null}
      {solutionFailed ? (
        <p role="alert" className="mt-2 text-sm text-flag-amber">
          {s.seeSolutionFailed}
        </p>
      ) : null}
      {attemptId !== null ? (
        <p role="status" className="mt-2 text-sm text-ink-muted">
          {s.attemptStarted}
        </p>
      ) : null}
    </>
  );
}
