import { ButtonLink } from "@/components/ui/button";
import { ParticleHero } from "@/components/particles/hero";
import { strings } from "./strings";

// The landing as a two-door threshold (decision 0073). The hero holds the
// brand moment (wordmark, tagline, the Roman line told once, the particle
// field behind it all) and the two addressed doors, the student's first
// because a code card in hand is the dominant arrival. Below the fold the
// page states the product honestly for each audience, everything
// server-rendered on the token layer with hairline rules carrying the
// structure; the particle field is the page's only ambient motion, and the
// server-rendered wordmark stays the LCP element.
export default function LandingPage() {
  const s = strings;
  return (
    <>
      <main>
        <ParticleHero>
          <section className="flex min-h-svh flex-col items-center justify-center px-6 py-16 text-center">
            <h1 className="font-display text-6xl font-black tracking-tight sm:text-7xl">
              {s.wordmark}
            </h1>
            <p className="mt-4 rounded-md bg-ground/80 px-4 py-1 text-lg sm:text-xl">
              {s.tagline}
            </p>
            <nav
              aria-label={s.doors}
              className="mt-12 grid w-full max-w-2xl gap-4 text-left sm:grid-cols-2"
            >
              <div className="flex flex-col rounded-lg border border-rule-line bg-ground p-6 transition-colors duration-(--motion-duration) ease-(--motion-ease) hover:border-accent">
                <h2 className="font-display text-2xl">{s.studentDoorHeading}</h2>
                <p className="mt-2 flex-1 text-pretty text-sm text-ink-muted">
                  {s.studentDoorBody}
                </p>
                <ButtonLink href="/enter" className="mt-5">
                  {s.enterCourse}
                </ButtonLink>
              </div>
              <div className="flex flex-col rounded-lg border border-rule-line bg-ground p-6 transition-colors duration-(--motion-duration) ease-(--motion-ease) hover:border-accent">
                <h2 className="font-display text-2xl">{s.professorDoorHeading}</h2>
                <p className="mt-2 flex-1 text-pretty text-sm text-ink-muted">
                  {s.professorDoorBody}
                </p>
                <div className="mt-5 flex gap-3">
                  <ButtonLink
                    href="/sign-in"
                    variant="quiet"
                    className="flex-1 border border-field-border"
                  >
                    {s.signIn}
                  </ButtonLink>
                  <ButtonLink
                    href="/sign-up"
                    variant="quiet"
                    className="flex-1 border border-field-border"
                  >
                    {s.signUp}
                  </ButtonLink>
                </div>
              </div>
            </nav>
            {/* A translucent plate in the ground colour keeps the two hero
                lines that have no card behind them legible when particle
                strokes drift beneath: invisible over plain ground, and
                theme-aware through the token. */}
            <p className="mt-12 max-w-prose rounded-md bg-ground/80 px-4 py-2 text-pretty text-sm text-ink-muted">
              {s.story}
            </p>
          </section>
        </ParticleHero>

        <section
          aria-labelledby="practice-heading"
          className="border-t border-rule-line px-6 py-20"
        >
          <div className="mx-auto w-full max-w-5xl">
            <h2 id="practice-heading" className="font-display text-3xl">
              {s.practiceHeading}
            </h2>
            <ol className="mt-10 grid gap-10 sm:grid-cols-3">
              {(
                [
                  [1, s.practiceStep1Title, s.practiceStep1Body],
                  [2, s.practiceStep2Title, s.practiceStep2Body],
                  [3, s.practiceStep3Title, s.practiceStep3Body],
                ] as const
              ).map(([n, title, body]) => (
                <li key={n} className="border-t border-rule-line pt-5">
                  <span aria-hidden="true" className="font-display text-4xl font-black">
                    {n}
                  </span>
                  <h3 className="mt-3 font-display text-xl">{title}</h3>
                  <p className="mt-2 text-pretty text-sm text-ink-muted">{body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <p className="border-t border-rule-line px-6 py-16 text-center font-display text-xl italic sm:text-2xl">
          {s.calm}
        </p>

        <section
          aria-labelledby="professor-heading"
          className="border-t border-rule-line px-6 py-20"
        >
          <div className="mx-auto w-full max-w-5xl">
            <h2 id="professor-heading" className="font-display text-3xl">
              {s.professorHeading}
            </h2>
            <div className="mt-10 grid gap-x-12 gap-y-10 sm:grid-cols-2">
              {(
                [
                  [s.professorImportTitle, s.professorImportBody],
                  [s.professorVariantsTitle, s.professorVariantsBody],
                  [s.professorSeatsTitle, s.professorSeatsBody],
                  [s.professorPictureTitle, s.professorPictureBody],
                ] as const
              ).map(([title, body]) => (
                <div key={title} className="border-t border-rule-line pt-5">
                  <h3 className="font-display text-xl">{title}</h3>
                  <p className="mt-2 text-pretty text-sm text-ink-muted">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-rule-line px-6 py-20 text-center">
          <p className="font-display text-2xl sm:text-3xl">{s.closingLine}</p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <ButtonLink href="/enter">{s.enterCourse}</ButtonLink>
            <ButtonLink
              href="/sign-in"
              variant="quiet"
              className="border border-field-border"
            >
              {s.signIn}
            </ButtonLink>
          </div>
        </section>
      </main>
      <footer className="border-t border-rule-line px-6 py-8 text-center text-sm text-ink-muted">
        <span className="font-display">{s.wordmark}</span>
      </footer>
    </>
  );
}
