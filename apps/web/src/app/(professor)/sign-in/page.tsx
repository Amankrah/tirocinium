import Link from "next/link";

import { Wordmark } from "@/components/ui/wordmark";
import { strings } from "../strings";
import { SignInForm } from "./sign-in-form";

// Professor sign-in (guide build order 1). Unlike the student seat entry this
// is an ordinary credential login: professors have real accounts. The screen
// stays as quiet as the seat entry (same sheet, same graph paper, decision
// 0102), plus the door to self-serve signup (decision 0072).
export default function SignInPage() {
  return (
    <main className="graph-paper flex min-h-svh flex-col items-center justify-center gap-8 px-4 py-16 sm:px-6">
      <Wordmark href="/" size="lg" />
      <div className="surface-raised flex w-full max-w-md flex-col gap-6 p-6 sm:p-8">
        <header className="flex flex-col gap-2">
          <h1 className="font-display text-3xl">{strings.signIn.title}</h1>
          <p className="text-pretty text-sm text-ink-muted">{strings.signIn.intro}</p>
        </header>
        <SignInForm />
      </div>
      <p className="text-sm text-ink-muted">
        <Link href="/sign-up" className="font-medium text-link">
          {strings.signIn.createAccount}
        </Link>
      </p>
    </main>
  );
}
