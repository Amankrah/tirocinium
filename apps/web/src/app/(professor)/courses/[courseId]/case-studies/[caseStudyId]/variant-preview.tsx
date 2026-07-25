"use client";

// Preview variants (frontend guide 4.3, Phase 5.5): generate three sample
// variants and show what a student would get, so the professor builds trust in
// the parameterization before publishing. Generation is pooled and background,
// so this enqueues then polls the list until each seed's variant verifies, then
// renders its body through the lazy client renderer (a flagged one links to the
// review queue instead). A client island driving injected server actions.
import Link from "next/link";
import dynamic from "next/dynamic";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { Schemas } from "@/lib/api/client";
import { strings } from "../../../../strings";

const ClientProblemBody = dynamic(() =>
  import("@/components/reading/client-problem-body").then((m) => m.ClientProblemBody),
);

const s = strings.variants;
const MAX_POLLS = 20;
const POLL_MS = 3000;

type Preview =
  | { seed: number; state: "pending" }
  | { seed: number; state: "verified"; body: string }
  | { seed: number; state: "flagged"; variantId: number };

type GenerateAction = (
  courseId: number,
  caseStudyId: number,
  count: number,
  key: string,
) => Promise<Schemas["GenerateOut"] | null>;
type ListAction = (
  courseId: number,
  caseStudyId: number,
  options: { state?: string; cursor?: number; limit?: number },
) => Promise<Schemas["VariantListOut"] | null>;
type GetAction = (
  courseId: number,
  variantId: number,
) => Promise<Schemas["VariantDetail"] | null>;

export function VariantPreview({
  courseId,
  caseStudyId,
  generate,
  list,
  get,
  makeId = () => crypto.randomUUID(),
  delay = (ms: number) => new Promise((r) => setTimeout(r, ms)),
}: {
  courseId: number;
  caseStudyId: number;
  generate: GenerateAction;
  list: ListAction;
  get: GetAction;
  makeId?: () => string;
  delay?: (ms: number) => Promise<void>;
}) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState(false);
  const [previews, setPreviews] = useState<Preview[]>([]);

  async function onGenerate() {
    setWorking(true);
    setError(false);
    setPreviews([]);
    const out = await generate(courseId, caseStudyId, 3, makeId());
    if (!out) {
      setError(true);
      setWorking(false);
      return;
    }
    const seeds = out.seeds;
    const resolved = new Map<number, Preview>();
    const render = () =>
      setPreviews(seeds.map((seed) => resolved.get(seed) ?? { seed, state: "pending" }));
    render();

    for (let attempt = 0; attempt < MAX_POLLS && resolved.size < seeds.length; attempt += 1) {
      const page = await list(courseId, caseStudyId, { limit: 20 });
      for (const item of page?.items ?? []) {
        if (item.seed == null || !seeds.includes(item.seed) || resolved.has(item.seed)) {
          continue;
        }
        if (item.verification === "verified" || item.verification === "manual") {
          const detail = await get(courseId, item.id);
          if (detail) resolved.set(item.seed, { seed: item.seed, state: "verified", body: detail.body });
        } else if (item.verification === "flagged") {
          resolved.set(item.seed, { seed: item.seed, state: "flagged", variantId: item.id });
        }
      }
      render();
      if (resolved.size < seeds.length) await delay(POLL_MS);
    }
    setWorking(false);
  }

  return (
    <section className="flex flex-col gap-4 border-t border-rule-line pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-2xl">{s.previewHeading}</h2>
        <div className="flex flex-wrap gap-3">
          <Link
            href={`/courses/${courseId}/case-studies/${caseStudyId}/review`}
            className="inline-flex items-center text-sm text-accent underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {s.reviewLink}
          </Link>
          <Button variant="quiet" onClick={() => void onGenerate()} disabled={working}>
            {s.generate}
          </Button>
        </div>
      </div>
      <p className="max-w-prose text-sm text-ink-muted">{s.previewIntro}</p>

      {error ? (
        <p role="alert" className="text-sm text-flag-amber">
          {s.generateError}
        </p>
      ) : null}

      {previews.length > 0 ? (
        <ol className="grid gap-4 lg:grid-cols-3">
          {previews.map((preview) => (
            <li
              key={preview.seed}
              className="flex flex-col gap-2 rounded-md border border-rule-line p-3"
            >
              <span className="text-xs text-ink-muted">{s.seedLabel(preview.seed)}</span>
              {preview.state === "pending" ? (
                <p className="text-sm text-ink-muted">{s.generating}</p>
              ) : preview.state === "flagged" ? (
                <Link
                  href={`/courses/${courseId}/case-studies/${caseStudyId}/review`}
                  className="text-sm text-flag-amber underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  {s.flagged}
                </Link>
              ) : (
                <ClientProblemBody body={preview.body} />
              )}
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
