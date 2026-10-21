import Link from "next/link";
import type { ReactNode } from "react";

import { Icon, type IconName } from "@/components/ui/icon";
import { Wordmark } from "@/components/ui/wordmark";
import { strings } from "./strings";

// The student app shell (guide 4.0, build order 1; restyled in decision
// 0102): the wordmark, the two places a student works (their course and the
// project marketplace, decision 0100), and the seat number kept quietly
// present so a student always knows which identity their work is filed
// under. No name, no avatar, nothing that tempts PII into the product;
// students are pseudonymous seats. A server component: pure markup, the seat
// number handed in by the surface that resolved the session.
//
// The header sticks because the seat number is the answer to "whose work is
// this", and a student scrolling a long problem or a transcription should not
// have to scroll back up to check. Opaque rather than translucent: text
// passing underneath a reading surface is a distraction, not an effect.
//
// Where the student is. Every student page is part of their course except the
// project marketplace, so the course is the default and only that page says
// otherwise. A prop rather than reading the path keeps the shell a Server
// Component with no script.
export type StudentSection = "course" | "marketplace";

const SECTIONS: { section: StudentSection; href: string; label: string; icon: IconName }[] = [
  { section: "course", href: "/course", label: strings.shell.course, icon: "book" },
  { section: "marketplace", href: "/marketplace", label: strings.shell.marketplace, icon: "store" },
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
      <header className="sticky top-0 z-40 min-h-[var(--app-header-height)] border-b border-rule-line bg-ground print:hidden">
        <div className="mx-auto flex min-h-[var(--app-header-height)] w-full max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <Wordmark href="/course" size="md" />
            <nav aria-label={strings.shell.nav}>
              <ul className="flex items-center gap-0.5 rounded-lg bg-surface-sunken p-0.5">
                {SECTIONS.map((item) => {
                  const current = item.section === section;
                  return (
                    <li key={item.section}>
                      <Link
                        href={item.href}
                        aria-current={current ? "page" : undefined}
                        className={
                          "inline-flex min-h-8 items-center gap-1.5 rounded-md px-3 text-sm " +
                          "transition-[background-color,color,box-shadow] duration-(--motion-duration) ease-(--motion-ease) " +
                          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent " +
                          (current
                            ? "bg-surface font-medium text-ink shadow-raised"
                            : "text-ink-muted hover:text-ink")
                        }
                      >
                        <Icon name={item.icon} size={14} />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-rule-line bg-surface px-3 py-1 font-mono text-xs tabular-nums text-ink-muted">
            <span className="size-1.5 rounded-full bg-verify-green" aria-hidden="true" />
            {strings.shell.seat(seatNumber)}
          </span>
        </div>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
