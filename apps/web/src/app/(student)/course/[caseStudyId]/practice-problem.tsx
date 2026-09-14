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

import { Button } from "@/components/ui/button";
import type { Schemas } from "@/lib/api/client";
import { strings } from "../../strings";

const ClientProblemBody = dynamic(() =>
  import("@/components/reading/client-problem-body").then((m) => m.ClientProblemBody),
);

type SwapAction = (
  caseStudyId: number,
  exclude: number | null,
) => Promise<Schemas["PracticeVariantOut"] | null>;

export function PracticeProblem({
  caseStudyId,
  initialVariantId,
  pricesMaterials,
  swap,
  children,
}: {
  caseStudyId: number;
  initialVariantId: number | null;
  // Whether this course quotes for materials (Phase 10). Most do not, and the
  // link is absent rather than disabled for them: a dead control is a worse
  // answer than no control.
  pricesMaterials: boolean;
  swap: SwapAction;
  children: ReactNode;
}) {
  // null until the first swap; then the client-rendered current variant.
  const [current, setCurrent] = useState<Schemas["PracticeVariantOut"] | null>(null);
  const [swapping, setSwapping] = useState(false);
  const s = strings.problem;

  const variantId = current ? current.variant_id : initialVariantId;

  async function onNewVariant() {
    setSwapping(true);
    const next = await swap(caseStudyId, variantId);
    if (next) setCurrent(next);
    setSwapping(false);
  }

  return (
    <>
      {current === null ? children : <ClientProblemBody body={current.body} />}

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-rule-line pt-6">
        <Button onClick={() => void onNewVariant()} disabled={swapping}>
          {s.newVariant}
        </Button>
        {variantId !== null ? (
          <Link
            href={`/course/${caseStudyId}/upload?variant=${variantId}`}
            className="inline-flex items-center justify-center rounded-md bg-accent px-4 py-2 font-medium text-on-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {s.upload}
          </Link>
        ) : (
          <Button variant="quiet" disabled title={s.uploadNeedsVariant}>
            {s.upload}
          </Button>
        )}
        {pricesMaterials && variantId !== null ? (
          <Link
            href={`/course/${caseStudyId}/marketplace?variant=${variantId}`}
            className="inline-flex items-center justify-center rounded-md px-4 py-2 font-medium text-ink hover:bg-rule-line/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {s.price}
          </Link>
        ) : null}
      </div>
    </>
  );
}
