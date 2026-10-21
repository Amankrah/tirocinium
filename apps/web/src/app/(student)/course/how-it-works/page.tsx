import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
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
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 py-10 sm:px-6">
        <PageHeader
          back={{ href: "/course", label: strings.problem.backToCourse }}
          title={s.pageTitle}
          description={s.intro}
          size="lg"
        />

        {/* An ordered list because the steps are a sequence, not a menu: the
            numbering is the content, so it comes from the element rather than
            from text baked into each heading. Each step is its own sheet. */}
        <ol className="flex flex-col gap-4">
          {s.steps.map((step, index) => (
            <Card key={step.title} as="li" tone="raised" className="flex gap-5 sm:gap-6">
              <span
                aria-hidden="true"
                className="font-display text-3xl font-black tabular-nums text-accent-text sm:text-4xl"
              >
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="flex min-w-0 flex-col gap-2">
                <h2 className="font-display text-2xl">{step.title}</h2>
                <p className="max-w-prose text-pretty leading-relaxed text-ink-muted">{step.body}</p>
              </div>
            </Card>
          ))}
        </ol>

        <p className="max-w-prose border-t border-rule-line pt-6 text-sm text-ink-muted">
          {s.reassurance}
        </p>
      </main>
    </StudentShell>
  );
}
