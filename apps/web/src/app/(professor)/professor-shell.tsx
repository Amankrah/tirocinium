import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/ui/icon";
import { Wordmark } from "@/components/ui/wordmark";
import { strings } from "./strings";

// The professor app shell (guide build order 1; restyled in decision 0102).
// Professors are not pseudonymous, so the shell shows the signed-in email
// and, unlike the student shell, a sign-out control (decision 0012). The
// sign-out action is handed in so this stays pure markup and the server-only
// cookie logic lives with the route; the form posts to it with no client
// JavaScript.
//
// Inside a course, the shell grows a course rail: the course's sections as a
// sidebar on wide screens and a scrolling tab row on narrow ones, so the
// seven places a professor works are one click apart from every one of them
// instead of a row of underlined links at the top of one page. The page says
// which section it is; the shell reads nothing from the path, so it stays a
// Server Component with no script.
//
// The header sticks, which costs the top --app-header-height of the viewport
// on every scroll. The queues move their cursor with scrollIntoView, so
// globals.css sets scroll-padding-top from the same token; without it, k into
// the first rows hides the row it just selected.
export type CourseSection =
  | "overview"
  | "seats"
  | "import"
  | "submissions"
  | "mastery"
  | "reports"
  | "materials"
  | "challenges";

export type CourseContext = {
  id: number;
  title: string;
  section: CourseSection;
};

const RAIL: { section: CourseSection; path: string; label: string; icon: IconName }[] = [
  { section: "overview", path: "", label: strings.rail.overview, icon: "layers" },
  { section: "seats", path: "/seats", label: strings.rail.seats, icon: "users" },
  { section: "import", path: "/import", label: strings.rail.import, icon: "file-import" },
  { section: "submissions", path: "/submissions", label: strings.rail.submissions, icon: "inbox" },
  { section: "mastery", path: "/mastery", label: strings.rail.mastery, icon: "chart" },
  { section: "reports", path: "/reports", label: strings.rail.reports, icon: "file" },
  { section: "materials", path: "/materials", label: strings.rail.materials, icon: "store" },
  { section: "challenges", path: "/challenges", label: strings.rail.challenges, icon: "book" },
];

export function ProfessorShell({
  email,
  signOut,
  course,
  children,
}: {
  email: string;
  signOut: () => Promise<void>;
  course?: CourseContext;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-40 min-h-[var(--app-header-height)] border-b border-rule-line bg-ground">
        <div className="mx-auto flex min-h-[var(--app-header-height)] w-full max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Wordmark href="/dashboard" size="md" />
            {course ? (
              <>
                <span aria-hidden="true" className="text-rule-line">
                  <Icon name="chevron-right" size={16} className="text-field-border" />
                </span>
                <Link
                  href={`/courses/${course.id}`}
                  className="min-w-0 truncate rounded-sm text-sm font-medium text-ink focus-ring"
                >
                  {course.title}
                </Link>
              </>
            ) : null}
          </div>
          <div className="flex min-w-0 items-center gap-2 sm:gap-4">
            <span className="hidden max-w-56 truncate text-sm text-ink-muted sm:inline">{email}</span>
            <form action={signOut}>
              <Button variant="quiet" size="sm" type="submit">
                <Icon name="log-out" size={14} />
                {strings.shell.signOut}
              </Button>
            </form>
          </div>
        </div>
      </header>
      {course ? (
        <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col lg:flex-row">
          <CourseRail course={course} />
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      ) : (
        <div className="flex-1">{children}</div>
      )}
    </div>
  );
}

function CourseRail({ course }: { course: CourseContext }) {
  return (
    <nav
      aria-label={strings.rail.label}
      className="border-b border-rule-line lg:sticky lg:top-[var(--app-header-height)] lg:h-[calc(100svh-var(--app-header-height))] lg:w-60 lg:shrink-0 lg:self-start lg:overflow-y-auto lg:border-r lg:border-b-0"
    >
      <ul className="flex gap-1 overflow-x-auto px-4 py-2 sm:px-6 lg:flex-col lg:px-4 lg:py-6">
        {RAIL.map((item) => {
          const current = item.section === course.section;
          return (
            <li key={item.section} className="shrink-0">
              <Link
                href={`/courses/${course.id}${item.path}`}
                aria-current={current ? "page" : undefined}
                className={
                  "flex min-h-9 items-center gap-2.5 rounded-md px-3 text-sm whitespace-nowrap " +
                  "transition-[background-color,color] duration-(--motion-duration) ease-(--motion-ease) " +
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent " +
                  (current
                    ? "bg-accent-soft font-medium text-accent-text"
                    : "text-ink-muted hover:bg-surface-sunken hover:text-ink")
                }
              >
                <Icon name={item.icon} size={16} />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
