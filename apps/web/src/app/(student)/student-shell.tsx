import type { ReactNode } from "react";

import { strings } from "./strings";

// The student app shell (guide 4.0, build order 1): the wordmark, and the seat
// number kept quietly present so a student always knows which identity their
// work is filed under. No name, no avatar, nothing that tempts PII into the
// product; students are pseudonymous seats. A server component: pure markup,
// the seat number handed in by the surface that resolved the session.
export function StudentShell({
  seatNumber,
  children,
}: {
  seatNumber: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex items-center justify-between border-b border-rule-line px-6 py-4">
        <span className="font-display text-lg">{strings.shell.wordmark}</span>
        <span className="font-mono text-sm tabular-nums text-ink-muted">
          {strings.shell.seat(seatNumber)}
        </span>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
