import type { ReactNode } from "react";

import { Icon, type IconName } from "./icon";

// An empty state invites the next action in one sentence (guide 3.4): a
// quiet icon in a sunken disc, the sentence, and at most one action. Never a
// nag, never a cartoon. Server-compatible.
export function EmptyState({
  icon = "inbox",
  title,
  body,
  action,
  className,
}: {
  icon?: IconName;
  title?: ReactNode;
  body: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={[
        "flex flex-col items-center gap-3 rounded-lg border border-dashed border-rule-line px-6 py-10 text-center",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span className="flex size-10 items-center justify-center rounded-full bg-surface-sunken text-ink-muted">
        <Icon name={icon} size={18} />
      </span>
      {title ? <p className="font-display text-xl">{title}</p> : null}
      <p className="max-w-prose text-pretty text-sm text-ink-muted">{body}</p>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
