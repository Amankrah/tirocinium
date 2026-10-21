"use client";

// The auto-parameterize review overlay (frontend guide 4.3, Phase 5.2/5.5): the
// proposed spec shown over the question text, every proposed value highlighted in
// place at the server-verified positions, with its range and the model's reason
// in a marginal chip, the invariant rationales, and the figure-locked values with
// their lock reasons. The professor accepts (loads it into the form to save) or
// dismisses. Positions are [start, end) char offsets into the question markdown;
// the highlight is on the source text, which is what the professor edits.
// Highlights take the accent tint (a proposal is a live state); locks take the
// amber of a recognition flag (decision 0102).
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import type { Schemas } from "@/lib/api/client";
import { strings } from "../../../../strings";

const s = strings.params;

export type Segment = { text: string; param?: string };

// Split the body into plain and highlighted segments from the annotation
// positions. Pure, so the offset maths is unit-tested. Overlapping or
// out-of-order marks are dropped rather than trusted (the backend verifies
// positions, but a defensive split never corrupts the text).
export function segmentBody(
  body: string,
  annotations: Schemas["ProposalOut"]["annotations"],
): Segment[] {
  const marks: { start: number; end: number; param: string }[] = [];
  for (const [param, annotation] of Object.entries(annotations)) {
    for (const [start, end] of annotation.positions ?? []) {
      if (start >= 0 && end <= body.length && start < end) {
        marks.push({ start, end, param });
      }
    }
  }
  marks.sort((a, b) => a.start - b.start);

  const segments: Segment[] = [];
  let cursor = 0;
  for (const mark of marks) {
    if (mark.start < cursor) continue; // skip an overlap
    if (mark.start > cursor) segments.push({ text: body.slice(cursor, mark.start) });
    segments.push({ text: body.slice(mark.start, mark.end), param: mark.param });
    cursor = mark.end;
  }
  if (cursor < body.length) segments.push({ text: body.slice(cursor) });
  return segments;
}

// One line for a parameter's range: the bounds, the number of choices, or
// what an entity stands for. Shared with the panel's parameter rows.
export function rangeSummary(
  param: NonNullable<Schemas["ParamSpec"]["parameters"]>[string],
): string {
  if (param.type === "number" || param.type === "integer") {
    return s.rangeNumber(param.range[0], param.range[1]);
  }
  if (param.type === "choice") return s.rangeChoice(param.options.length);
  return param.description ?? param.base;
}

export function AutoOverlay({
  body,
  proposal,
  onAccept,
  onDismiss,
}: {
  body: string;
  proposal: Schemas["ProposalOut"];
  onAccept: () => void;
  onDismiss: () => void;
}) {
  const segments = segmentBody(body, proposal.annotations);
  const parameters = Object.entries(proposal.spec.parameters ?? {});

  return (
    <section
      aria-label={s.proposalHeading}
      className="flex flex-col gap-4 rounded-lg border border-accent/30 bg-surface p-5 shadow-raised"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-display text-xl">{s.proposalHeading}</h3>
        <span className="inline-flex items-center gap-1.5 text-xs text-accent-text">
          <Icon name="sparkle" size={14} />
          {s.aiProposed}
        </span>
      </div>
      <p className="max-w-prose text-sm text-ink-muted">{s.proposalIntro}</p>

      <p className="whitespace-pre-wrap rounded-md bg-surface-sunken p-4 font-mono text-sm leading-relaxed text-ink">
        {segments.map((seg, i) =>
          seg.param ? (
            <mark
              key={i}
              title={seg.param}
              className="rounded-sm bg-accent-soft px-0.5 text-accent-text ring-1 ring-accent/25"
            >
              {seg.text}
            </mark>
          ) : (
            <span key={i}>{seg.text}</span>
          ),
        )}
      </p>

      <ul className="flex flex-col divide-y divide-rule-line">
        {parameters.map(([name, param]) => (
          <li key={name} className="flex flex-col gap-0.5 py-2 first:pt-0 last:pb-0">
            <span className="flex flex-wrap items-baseline gap-x-3 text-sm text-ink">
              <span className="font-mono font-medium">{name}</span>
              <span className="font-mono text-xs tabular-nums text-ink-muted">
                {rangeSummary(param)}
              </span>
            </span>
            {proposal.annotations[name]?.rationale ? (
              <span className="text-xs text-ink-muted">
                {proposal.annotations[name]!.rationale}
              </span>
            ) : null}
          </li>
        ))}
      </ul>

      {proposal.invariant_rationales.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {(proposal.spec.invariants ?? []).map((inv, i) => (
            <li key={i} className="text-sm text-ink">
              {inv}
              {proposal.invariant_rationales[i] ? (
                <span className="text-xs text-ink-muted">
                  {" ("}
                  {proposal.invariant_rationales[i]}
                  {")"}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {proposal.frozen.length > 0 ? (
        <ul className="flex flex-col gap-1.5 rounded-lg border border-flag-amber/40 bg-flag-amber-soft p-4">
          {proposal.frozen.map((f) => (
            <li
              key={`${f.parameter}-${f.figure_id}`}
              className="flex items-start gap-2 text-sm text-flag-amber"
            >
              <Icon name="lock" size={14} className="mt-0.5" />
              <span>
                <span className="font-medium">{s.lockedTo(f.value)}</span>: {f.reason}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button onClick={onAccept}>
          <Icon name="check" size={16} />
          {s.accept}
        </Button>
        <Button variant="quiet" onClick={onDismiss}>
          {s.dismiss}
        </Button>
      </div>
    </section>
  );
}
