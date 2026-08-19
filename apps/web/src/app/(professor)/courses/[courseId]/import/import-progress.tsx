"use client";

// The processing view for import-from-PDF (frontend guide 4.3): a checklist of
// honest stages, a motion-safe shimmer on the live step, and a ticking
// elapsed line so a two-minute wait is named rather than silent.
import type { ImportState } from "@/lib/imports/import-controller";
import { readingLine, stepStatuses, type ImportWorkStep } from "@/lib/imports/stages";
import { strings } from "../../../strings";

const s = strings.import;

const STEPS: ImportWorkStep[] = ["uploading", "reading", "figures", "segmenting"];

function labelFor(
  step: ImportWorkStep,
  state: ImportState,
): string {
  if (step === "uploading") return s.uploading;
  if (step === "figures") return s.figures;
  if (step === "segmenting") return s.segmenting;
  return readingLine(s, state.pageCount, state.pagesDone);
}

export function ImportProgress({
  state,
  elapsedSeconds,
}: {
  state: ImportState;
  elapsedSeconds: number;
}) {
  const statuses = stepStatuses(state.phase, state.stage);
  const currentLabels = STEPS.filter((step) => statuses[step] === "current").map(
    (step) => labelFor(step, state),
  );
  return (
    <div className="flex flex-col gap-4">
      <p className="sr-only" aria-live="polite">
        {currentLabels.join(". ")}
      </p>
      <ol className="flex flex-col border-t border-rule-line">
        {STEPS.map((step) => {
          const status = statuses[step];
          const current = status === "current";
          return (
            <li
              key={step}
              aria-current={current ? "step" : undefined}
              className={
                current
                  ? "progress-shimmer relative overflow-hidden border-b border-l-2 border-b-rule-line border-l-accent py-3 pl-3 text-sm text-ink"
                  : status === "done"
                    ? "border-b border-l-2 border-b-rule-line border-l-verify-green py-3 pl-3 text-sm text-ink-muted"
                    : "border-b border-l-2 border-b-rule-line border-l-transparent py-3 pl-3 text-sm text-ink-muted"
              }
            >
              {labelFor(step, state)}
              {step === "reading" &&
              current &&
              state.pageCount !== null &&
              state.pageCount > 0 ? (
                <progress
                  value={state.pagesDone}
                  max={state.pageCount}
                  className="mt-2 h-1 w-full"
                  aria-hidden="true"
                />
              ) : null}
            </li>
          );
        })}
      </ol>
      {elapsedSeconds >= 1 ? (
        <p className="text-sm text-ink-muted tabular-nums">
          {s.elapsedLive(elapsedSeconds)}
        </p>
      ) : null}
      {state.phase === "uploading" ? (
        <progress
          value={state.progress}
          max={1}
          className="h-1 w-full"
          aria-label={s.uploading}
        />
      ) : null}
    </div>
  );
}
