import Link from "next/link";

import { strings } from "../strings";
import { SignInForm } from "./sign-in-form";

// Professor sign-in (guide build order 1). Unlike the student seat entry this
// is an ordinary credential login: professors have real accounts. The screen
// stays as quiet as the seat entry, plus the door to self-serve signup
// (decision 0065).
export default function SignInPage() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center px-6 py-16">
      <div className="flex w-full max-w-md flex-col gap-8">
        <header className="flex flex-col gap-3 text-center">
          <h1 className="font-display text-4xl">{strings.signIn.title}</h1>
          <p className="text-pretty text-sm text-ink-muted">{strings.signIn.intro}</p>
        </header>
        <SignInForm />
        <p className="text-center text-sm">
          <Link
            href="/sign-up"
            className="text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {strings.signIn.createAccount}
          </Link>
        </p>
      </div>
    </main>
  );
}
