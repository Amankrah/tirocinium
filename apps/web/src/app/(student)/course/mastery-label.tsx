import type { Schemas } from "@/lib/api/client";
import { strings } from "../strings";

// A mastery label that can never be shown bare (mastery spec 9, constraint 4):
// the label always resolves, on tap, to the plain-language evidence trail the
// model returned. A Server Component using a native <details>, so the disclosure
// works with zero client JavaScript and full keyboard and screen-reader support.
// Trail wording is the model's own and shown verbatim. Unseen concepts (no
// evidence) render quietly as "Not started", which is not a claim to expand.
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
    return <span className="text-sm text-ink-muted">{s.notStarted}</span>;
  }

  return (
    <details className="text-sm">
      <summary className="flex cursor-pointer items-center gap-2 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
        <span className="font-medium text-ink">{labelText(label)}</span>
        <span className="text-xs text-ink-muted underline">{s.evidence}</span>
      </summary>
      <ul className="mt-2 flex flex-col gap-1 border-l-2 border-rule-line pl-3">
        {trail.map((line, index) => (
          <li key={index} className="text-ink-muted">
            {line.text}{" "}
            <time
              dateTime={new Date(line.at * 1000).toISOString()}
              className="text-xs"
            >
              {formatDate(line.at)}
            </time>
          </li>
        ))}
      </ul>
    </details>
  );
}
