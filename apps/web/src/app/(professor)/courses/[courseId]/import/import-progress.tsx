"use client";

// The processing view for import-from-PDF (frontend guide 4.3): a checklist of
// honest stages on a raised sheet, a motion-safe shimmer on the live step, and
// a ticking elapsed line so a two-minute wait is named rather than silent.
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
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
    <Card padded={false} className="flex flex-col overflow-hidden">
      <p className="sr-only" aria-live="polite">
        {currentLabels.join(". ")}
      </p>
      <ol className="flex flex-col divide-y divide-rule-line">
        {STEPS.map((step) => {
          const status = statuses[step];
          const current = status === "current";
          return (
            <li
              key={step}
              aria-current={current ? "step" : undefined}
              className={
                current
                  ? "progress-shimmer relative flex flex-col gap-2 overflow-hidden border-l-2 border-l-accent bg-accent-soft/40 px-4 py-3 text-sm font-medium text-ink"
                  : status === "done"
                    ? "flex items-center gap-2 border-l-2 border-l-verify-green px-4 py-3 text-sm text-ink-muted"
                    : "flex items-center gap-2 border-l-2 border-l-transparent px-4 py-3 text-sm text-ink-muted"
              }
            >
              {status === "done" ? (
                <Icon name="check" size={14} className="text-verify-green" />
              ) : null}
              {labelFor(step, state)}
              {step === "reading" &&
              current &&
              state.pageCount !== null &&
              state.pageCount > 0 ? (
                <progress
                  value={state.pagesDone}
                  max={state.pageCount}
                  className="h-1 w-full"
                  aria-hidden="true"
                />
              ) : null}
            </li>
          );
        })}
      </ol>
      {elapsedSeconds >= 1 || state.phase === "uploading" ? (
        <div className="flex flex-col gap-2 border-t border-rule-line bg-surface-sunken/40 px-4 py-2.5">
          {elapsedSeconds >= 1 ? (
            <p className="flex items-center gap-1.5 font-mono text-xs tabular-nums text-ink-muted">
              <Icon name="clock" size={12} />
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
      ) : null}
    </Card>
  );
}
