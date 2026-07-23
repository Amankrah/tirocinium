import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { strings } from "./strings";

// The professor app shell (guide build order 1). Professors are not
// pseudonymous, so the shell shows the signed-in email and, unlike the student
// shell, a sign-out control (decision 0012). The sign-out action is handed in
// so this stays pure markup and the server-only cookie logic lives with the
// route; the form posts to it with no client JavaScript.
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
      <header className="flex items-center justify-between border-b border-rule-line px-6 py-4">
        <span className="font-display text-lg">{strings.shell.wordmark}</span>
        <div className="flex items-center gap-4">
          <span className="text-sm text-ink/60">{email}</span>
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
