import { strings } from "../strings";
import { SignInForm } from "./sign-in-form";

// Professor sign-in (guide build order 1). Unlike the student seat entry this
// is an ordinary credential login: professors have real accounts. The screen
// stays as quiet as the seat entry, one heading and the form.
export default function SignInPage() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-8 px-6">
      <h1 className="font-display text-3xl">{strings.signIn.title}</h1>
      <SignInForm />
    </main>
  );
}
