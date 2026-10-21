import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
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
    <Card
      as="section"
      tone="raised"
      aria-labelledby="onboarding-title"
      className="flex flex-col gap-5"
    >
      <h2 id="onboarding-title" className="font-display text-2xl">
        {s.panelTitle}
      </h2>

      {/* The short version: the four step titles as a sequence. The bodies
          live on the page, because this is an orientation and that is the
          explanation. */}
      <ol className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
        {s.steps.map((step, index) => (
          <li key={step.title} className="flex items-baseline gap-3">
            <span
              aria-hidden="true"
              className="font-display text-2xl tabular-nums text-accent-text"
            >
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className="text-ink">{step.title}</span>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap items-center gap-3 border-t border-rule-line pt-5">
        <ButtonLink href="/course/how-it-works" variant="secondary">
          {s.pageLink}
          <Icon name="arrow-right" size={14} className="text-ink-muted" />
        </ButtonLink>
        <form action={dismissOnboarding}>
          <Button variant="quiet" type="submit">
            {s.panelDismiss}
          </Button>
        </form>
      </div>
    </Card>
  );
}
