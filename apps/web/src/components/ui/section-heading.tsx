import type { ReactNode } from "react";

// A section's title row (decision 0102): the heading in the display face, an
// optional count or status beside it in tabular figures, actions on the far
// side, and the hairline beneath that the baseline rhythm is built on.
// Server-compatible.
export function SectionHeading({
  id,
  title,
  count,
  description,
  actions,
  level = 2,
  rule = true,
  className,
}: {
  id?: string;
  title: ReactNode;
  count?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  level?: 2 | 3;
  rule?: boolean;
  className?: string;
}) {
  const Tag = level === 2 ? "h2" : "h3";
  return (
    <div
      className={[
        "flex flex-col gap-1",
        rule ? "border-b border-rule-line pb-3" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <div className="flex items-baseline gap-3">
          <Tag id={id} className={level === 2 ? "font-display text-2xl" : "font-display text-xl"}>
            {title}
          </Tag>
          {count != null ? (
            <span className="text-sm tabular-nums text-ink-muted">{count}</span>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {description ? <p className="max-w-prose text-sm text-ink-muted">{description}</p> : null}
    </div>
  );
}
