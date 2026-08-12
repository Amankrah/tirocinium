import Link from "next/link";

import { strings } from "../strings";
import { SignUpForm } from "./sign-up-form";

// Professor self-serve signup (decision 0065, backend guide 7.1). The API
// accepts email and password only; the page says who the account is for, asks
// for the password twice, and points students at /enter.
export default function SignUpPage() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center px-6 py-16">
      <div className="flex w-full max-w-md flex-col gap-8">
        <header className="flex flex-col gap-3 text-center">
          <h1 className="font-display text-4xl">{strings.signUp.title}</h1>
          <p className="text-pretty text-sm text-ink-muted">{strings.signUp.intro}</p>
        </header>
        <SignUpForm />
        <p className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm">
          <Link
            href="/sign-in"
            className="text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {strings.signUp.signIn}
          </Link>
          <Link
            href="/enter"
            className="text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {strings.signUp.enterCourse}
          </Link>
        </p>
      </div>
    </main>
  );
}
