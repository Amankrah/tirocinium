import Link from "next/link";
import type { ReactNode } from "react";

import { strings } from "./strings";

// The student app shell (guide 4.0, build order 1): the wordmark, the two
// places a student works (their course and the project marketplace, decision
// 0100), and the seat number kept quietly present so a student always knows
// which identity their work is filed under. No name, no avatar, nothing that tempts PII into the
// product; students are pseudonymous seats. A server component: pure markup,
// the seat number handed in by the surface that resolved the session.
//
// The header sticks because the seat number is the answer to "whose work is
// this", and a student scrolling a long problem or a transcription should not
// have to scroll back up to check. Opaque rather than translucent: text
// passing underneath a reading surface is a distraction, not an effect.
// Where the student is. Every student page is part of their course except the
// project marketplace, so the course is the default and only that page says
// otherwise. A prop rather than reading the path keeps the shell a Server
// Component with no script.
export type StudentSection = "course" | "marketplace";

const SECTIONS: { section: StudentSection; href: string; label: string }[] = [
  { section: "course", href: "/course", label: strings.shell.course },
  { section: "marketplace", href: "/marketplace", label: strings.shell.marketplace },
];

export function StudentShell({
  seatNumber,
  section = "course",
  children,
}: {
  seatNumber: string;
  section?: StudentSection;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-svh flex-col">
      {/* Not printed: a page a student prints (a project quotation) is the
          document, and the seat chrome is not part of it. */}
      <header className="sticky top-0 z-40 flex min-h-[var(--app-header-height)] flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-rule-line bg-ground px-6 py-4 print:hidden">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <span className="font-display text-lg">{strings.shell.wordmark}</span>
          <nav aria-label={strings.shell.nav}>
            <ul className="flex items-center gap-1">
              {SECTIONS.map((item) => {
                const current = item.section === section;
                return (
                  <li key={item.section}>
                    <Link
                      href={item.href}
                      aria-current={current ? "page" : undefined}
                      className={
                        "inline-flex min-h-6 items-center rounded-md px-2 py-1 text-sm underline-offset-4 " +
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent " +
                        (current
                          ? "text-ink underline decoration-accent decoration-2"
                          : "text-ink-muted hover:text-ink hover:underline")
                      }
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
        <span className="font-mono text-sm tabular-nums text-ink-muted">
          {strings.shell.seat(seatNumber)}
        </span>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
