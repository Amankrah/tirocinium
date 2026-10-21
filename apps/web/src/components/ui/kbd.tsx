import type { ReactNode } from "react";

// A keyboard key, for the professor surfaces whose keyboard model is a launch
// requirement (guide 4.4): j/k through a queue, a/e to approve or edit.
// Server-compatible.
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex min-w-5 items-center justify-center rounded border border-field-border/60 bg-surface px-1.5 font-mono text-[0.7rem] leading-5 text-ink shadow-[0_1px_0_var(--color-field-border)]">
      {children}
    </kbd>
  );
}
