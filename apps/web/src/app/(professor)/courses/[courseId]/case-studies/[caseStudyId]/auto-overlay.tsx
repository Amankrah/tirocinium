"use client";

// The auto-parameterize review overlay (frontend guide 4.3, Phase 5.2/5.5): the
// proposed spec shown over the question text, every proposed value highlighted in
// place at the server-verified positions, with its range and the model's reason
// in a marginal chip, the invariant rationales, and the figure-locked values with
// their lock reasons. The professor accepts (loads it into the form to save) or
// dismisses. Positions are [start, end) char offsets into the question markdown;
// the highlight is on the source text, which is what the professor edits.
import { Button } from "@/components/ui/button";
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

function rangeSummary(param: NonNullable<Schemas["ParamSpec"]["parameters"]>[string]): string {
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
      className="flex flex-col gap-4 rounded-md border border-accent/40 bg-accent/5 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-display text-xl">{s.proposalHeading}</h3>
        <span className="text-xs text-ink-muted">{s.aiProposed}</span>
      </div>
      <p className="text-sm text-ink-muted">{s.proposalIntro}</p>

      <p className="whitespace-pre-wrap rounded-md border border-rule-line bg-paper p-3 font-mono text-sm text-ink">
        {segments.map((seg, i) =>
          seg.param ? (
            <mark
              key={i}
              title={seg.param}
              className="rounded bg-accent/20 px-0.5 text-ink"
            >
              {seg.text}
            </mark>
          ) : (
            <span key={i}>{seg.text}</span>
          ),
        )}
      </p>

      <ul className="flex flex-col gap-2">
        {parameters.map(([name, param]) => (
          <li key={name} className="flex flex-col gap-0.5">
            <span className="text-sm text-ink">
              <span className="font-medium">{name}</span>{" "}
              <span className="text-ink-muted">{rangeSummary(param)}</span>
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
        <ul className="flex flex-col gap-1 rounded-md border border-flag-amber/40 p-3">
          {proposal.frozen.map((f) => (
            <li key={`${f.parameter}-${f.figure_id}`} className="text-sm text-flag-amber">
              {s.lockedTo(f.value)}: {f.reason}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button onClick={onAccept}>{s.accept}</Button>
        <Button variant="quiet" onClick={onDismiss}>
          {s.dismiss}
        </Button>
      </div>
    </section>
  );
}
