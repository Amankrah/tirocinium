import Link from "next/link";

import { Wordmark } from "@/components/ui/wordmark";
import { strings } from "../strings";
import { SignUpForm } from "./sign-up-form";

// Professor self-serve signup (decision 0072, backend guide 7.1). The API
// accepts email and password only; the page says who the account is for, asks
// for the password twice, and points students at /enter. Same sheet as
// sign-in and the seat entry (decision 0102).
export default function SignUpPage() {
  return (
    <main className="graph-paper flex min-h-svh flex-col items-center justify-center gap-8 px-4 py-16 sm:px-6">
      <Wordmark href="/" size="lg" />
      <div className="surface-raised flex w-full max-w-md flex-col gap-6 p-6 sm:p-8">
        <header className="flex flex-col gap-2">
          <h1 className="font-display text-3xl">{strings.signUp.title}</h1>
          <p className="text-pretty text-sm text-ink-muted">{strings.signUp.intro}</p>
        </header>
        <SignUpForm />
      </div>
      <p className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-ink-muted">
        <Link href="/sign-in" className="font-medium text-link">
          {strings.signUp.signIn}
        </Link>
        <Link href="/enter" className="font-medium text-link">
          {strings.signUp.enterCourse}
        </Link>
      </p>
    </main>
  );
}
