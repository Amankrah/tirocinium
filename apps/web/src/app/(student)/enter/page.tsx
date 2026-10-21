import Link from "next/link";

import { Wordmark } from "@/components/ui/wordmark";
import { strings } from "../strings";
import { SeatCodeForm } from "./seat-code-form";

// Guide 4.0: one screen, the code field, a single action, nothing else. It
// should feel like unlocking something rather than logging in: the wordmark
// above, the form on a raised sheet over graph paper, and one quiet line
// beneath for a professor who landed here by mistake (decision 0102).
export default function EnterCoursePage() {
  return (
    <main className="graph-paper flex min-h-svh flex-col items-center justify-center gap-8 px-4 py-16 sm:px-6">
      <Wordmark href="/" size="lg" />
      <div className="surface-raised flex w-full max-w-md flex-col gap-6 p-6 sm:p-8">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-3xl">{strings.enter.title}</h1>
          <p className="text-sm text-ink-muted">{strings.enter.intro}</p>
        </div>
        <SeatCodeForm />
      </div>
      <p className="text-sm text-ink-muted">
        {strings.enter.teachLine}{" "}
        <Link href="/sign-in" className="font-medium text-link">
          {strings.enter.signIn}
        </Link>
      </p>
    </main>
  );
}
