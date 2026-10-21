import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import type { Schemas } from "@/lib/api/client";
import { strings } from "../strings";

// A mastery label that can never be shown bare (mastery spec 9, constraint 4):
// the label always resolves, on tap, to the plain-language evidence trail the
// model returned. A Server Component using a native <details>, so the disclosure
// works with zero client JavaScript and full keyboard and screen-reader support.
// Trail wording is the model's own and shown verbatim. Unseen concepts (no
// evidence) render quietly as "Not started", which is not a claim to expand.
//
// Every label wears the same neutral chip. Guide 3.2 keeps green and amber for
// variant and recognition states, and the picture has no colour hierarchy by
// design: "shaky" is a word, not a warning.
const s = strings.mastery;

function labelText(label: string): string {
  return s.labels[label] ?? label;
}

function formatDate(at: number): string {
  return new Date(at * 1000).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function MasteryLabel({
  label,
  trail,
}: {
  label: string;
  trail: Schemas["TrailLine"][];
}) {
  if (label === "unseen" || trail.length === 0) {
    return <Badge tone="neutral">{s.notStarted}</Badge>;
  }

  return (
    <details className="group text-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-sm focus-ring [&::-webkit-details-marker]:hidden">
        <Badge tone="neutral">{labelText(label)}</Badge>
        <span className="inline-flex items-center gap-1 text-xs text-ink-muted underline decoration-ink-muted/40 underline-offset-4 transition-colors duration-(--motion-duration) ease-(--motion-ease) group-hover:text-ink">
          {s.evidence}
          <Icon
            name="chevron-down"
            size={12}
            className="transition-transform duration-(--motion-duration) ease-(--motion-ease) group-open:rotate-180"
          />
        </span>
      </summary>
      <ul className="mt-3 flex flex-col gap-1.5 border-l-2 border-rule-line pl-3">
        {trail.map((line, index) => (
          <li key={index} className="text-ink-muted">
            {line.text}{" "}
            <time
              dateTime={new Date(line.at * 1000).toISOString()}
              className="font-mono text-xs tabular-nums"
            >
              {formatDate(line.at)}
            </time>
          </li>
        ))}
      </ul>
    </details>
  );
}
