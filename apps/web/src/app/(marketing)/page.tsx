import Link from "next/link";

import { ButtonLink } from "@/components/ui/button";
import { ParticleHero } from "@/components/particles/hero";
import { strings } from "./strings";

// The landing as a threshold, thinned to one decision (decisions 0073 and
// 0075). A sticky header carries the wordmark and the two quiet ways in, so
// they are reachable from any scroll depth; the hero itself asks one thing
// (enter the course), with the professor's path a single quiet line beneath
// it rather than a competing door. Below the fold the page states the product
// honestly for each audience, everything server-rendered on the token layer
// with hairline rules carrying the structure; the particle field is the
// page's only ambient motion, and the server-rendered wordmark stays the LCP
// element.
export default function LandingPage() {
  const s = strings;
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-rule-line bg-ground/95">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-3">
          <span className="font-display text-xl font-black tracking-tight">
            {s.wordmark}
          </span>
          <nav aria-label={s.doors} className="flex items-center gap-2">
            <ButtonLink href="/sign-in" variant="quiet" className="text-sm">
              {s.signIn}
            </ButtonLink>
            <ButtonLink href="/enter" className="text-sm">
              {s.enterCourse}
            </ButtonLink>
          </nav>
        </div>
      </header>
      <main>
        <ParticleHero>
          <section className="flex min-h-[calc(100svh-3.5rem)] flex-col items-center justify-center px-6 py-16 text-center">
            <h1 className="font-display text-6xl font-black tracking-tight sm:text-7xl">
              {s.wordmark}
            </h1>
            <p className="mt-4 rounded-md bg-ground/80 px-4 py-1 text-lg sm:text-xl">
              {s.tagline}
            </p>
            <ButtonLink href="/enter" className="mt-10 px-8 py-3 text-lg">
              {s.enterCourse}
            </ButtonLink>
            {/* One quiet line, not a second door: the professor's way in
                (decision 0075). Plated like the tagline so particle strokes
                drifting beneath never cross the small text at full contrast
                (decision 0073). */}
            <p className="mt-4 rounded-md bg-ground/80 px-4 py-1 text-sm text-ink-muted">
              {s.teachLine}{" "}
              <Link
                href="/sign-up"
                className="font-medium text-accent-text underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {s.signUp}
              </Link>
            </p>
            <p className="mt-14 max-w-prose rounded-md bg-ground/80 px-4 py-2 text-pretty text-sm text-ink-muted">
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
            <div className="mt-12">
              <ButtonLink
                href="/sign-up"
                variant="quiet"
                className="border border-field-border"
              >
                {s.signUp}
              </ButtonLink>
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
