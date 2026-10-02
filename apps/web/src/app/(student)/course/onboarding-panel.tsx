import Link from "next/link";

import { Button } from "@/components/ui/button";
import { strings } from "../strings";
import { dismissOnboarding } from "./actions";

// The first-run panel (guide 4.2). Shown once per seat, not once per browser:
// the fact lives on the seat row, so a student who reads this on a phone does
// not meet it again on a laptop.
//
// Deliberately not a modal. A student arriving at their course came to find a
// problem, and a dialog that has to be dismissed before the page can be used
// makes the explanation an obstacle rather than an offer. This sits above the
// index, says the short version, and gets out of the way when asked.
//
// No client JavaScript: the dismissal is a form posting to a server action, so
// it works before hydration and on a page that ships none.
export function OnboardingPanel() {
  const s = strings.onboarding;

  return (
    <section
      aria-labelledby="onboarding-title"
      className="flex flex-col gap-4 rounded-lg border border-rule-line p-6"
    >
      <h2 id="onboarding-title" className="font-display text-xl">
        {s.panelTitle}
      </h2>

      {/* The short version: the four step titles as a sequence. The bodies
          live on the page, because this is an orientation and that is the
          explanation. */}
      <ol className="flex flex-col gap-1 text-ink-muted">
        {s.steps.map((step, index) => (
          <li key={step.title}>
            <span className="font-mono text-sm tabular-nums">{index + 1}</span>{" "}
            {step.title}
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap items-center gap-4">
        <Link
          href="/course/how-it-works"
          className="text-sm text-accent-text underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {s.pageLink}
        </Link>
        <form action={dismissOnboarding}>
          <Button variant="quiet" type="submit" className="text-sm">
            {s.panelDismiss}
          </Button>
        </form>
      </div>
    </section>
  );
}
