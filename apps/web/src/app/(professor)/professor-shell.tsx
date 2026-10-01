import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { strings } from "./strings";

// The professor app shell (guide build order 1). Professors are not
// pseudonymous, so the shell shows the signed-in email and, unlike the student
// shell, a sign-out control (decision 0012). The sign-out action is handed in
// so this stays pure markup and the server-only cookie logic lives with the
// route; the form posts to it with no client JavaScript.
//
// The header sticks, which costs the top --app-header-height of the viewport
// on every scroll. The queues move their cursor with scrollIntoView, so
// globals.css sets scroll-padding-top from the same token; without it, k into
// the first rows hides the row it just selected.
export function ProfessorShell({
  email,
  signOut,
  children,
}: {
  email: string;
  signOut: () => Promise<void>;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-40 flex min-h-[var(--app-header-height)] items-center justify-between border-b border-rule-line bg-ground px-6 py-4">
        <span className="font-display text-lg">{strings.shell.wordmark}</span>
        <div className="flex items-center gap-4">
          <span className="text-sm text-ink-muted">{email}</span>
          <form action={signOut}>
            <Button variant="quiet" type="submit" className="text-sm">
              {strings.shell.signOut}
            </Button>
          </form>
        </div>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
