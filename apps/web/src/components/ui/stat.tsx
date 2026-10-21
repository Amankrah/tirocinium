import type { ReactNode } from "react";

// A figure with its label (decision 0102): for the professor's reporting
// surfaces and the student's history, where one number is the point. Value
// in the display face at tabular figures; label and hint quiet. Never a
// coloured tile: the palette's state colours are for states, not decoration.
// Server-compatible.
export function Stat({
  label,
  value,
  hint,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <div className={["flex flex-col gap-1", className].filter(Boolean).join(" ")}>
      <span className="text-sm text-ink-muted">{label}</span>
      <span className="font-display text-3xl tabular-nums leading-none">{value}</span>
      {hint ? <span className="text-xs text-ink-muted">{hint}</span> : null}
    </div>
  );
}
