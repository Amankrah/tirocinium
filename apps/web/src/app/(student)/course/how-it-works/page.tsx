import Link from "next/link";

import { requireSeat } from "@/lib/seat-session";
import { StudentShell } from "../../student-shell";
import { strings } from "../../strings";

// How practice works (guide 4.2). The standing explanation, reachable whenever
// a student wants it rather than only on the day they first arrive: the first
// week is exactly when someone is least able to take in how the defence fits,
// and week six is when they wonder. The first-run panel on course home says
// the short version and links here.
//
// A Server Component with no client JavaScript at all: it is prose and a list,
// and the seat is resolved from the httpOnly session like every other student
// surface (decision 0011).
export default async function HowItWorksPage() {
  const { seat } = await requireSeat();
  const s = strings.onboarding;

  return (
    <StudentShell seatNumber={seat.seat_number}>
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-12">
        <Link
          href="/course"
          className="self-start text-sm text-accent-text underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {strings.problem.backToCourse}
        </Link>

        <header className="flex flex-col gap-3">
          <h1 className="font-display text-3xl">{s.pageTitle}</h1>
          <p className="text-ink-muted">{s.intro}</p>
        </header>

        {/* An ordered list because the steps are a sequence, not a menu: the
            numbering is the content, so it comes from the element rather than
            from text baked into each heading. */}
        <ol className="flex flex-col gap-8">
          {s.steps.map((step, index) => (
            <li key={step.title} className="flex gap-4">
              <span
                aria-hidden="true"
                className="font-mono text-sm tabular-nums text-ink-muted"
              >
                {index + 1}
              </span>
              <div className="flex flex-col gap-2">
                <h2 className="font-display text-xl">{step.title}</h2>
                <p className="text-ink-muted">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <p className="border-t border-rule-line pt-6 text-sm text-ink-muted">
          {s.reassurance}
        </p>
      </main>
    </StudentShell>
  );
}
