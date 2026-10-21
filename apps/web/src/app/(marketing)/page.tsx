import Link from "next/link";

import { ParticleHero } from "@/components/particles/hero";
import { ButtonLink } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/ui/icon";
import { Wordmark } from "@/components/ui/wordmark";
import { strings } from "./strings";

// The landing as a threshold, thinned to one decision (decisions 0073 and
// 0075; restyled in 0102). A sticky header carries the wordmark and the two
// quiet ways in, so they are reachable from any scroll depth; the hero itself
// asks one thing (enter the course), with the professor's path a single quiet
// line beneath it rather than a competing door. Below the fold the page
// states the product honestly for each audience, everything server-rendered
// on the token layer with hairline rules carrying the structure; the particle
// field is the page's only ambient motion, and the server-rendered wordmark
// stays the LCP element.
const PRACTICE_ICONS: IconName[] = ["refresh", "pen", "mic"];
const PROFESSOR_ICONS: IconName[] = ["file-import", "sparkle", "users", "chart"];

export default function LandingPage() {
  const s = strings;
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-rule-line bg-ground/90 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Wordmark size="md" />
          <nav aria-label={s.doors} className="flex items-center gap-2">
            <ButtonLink href="/sign-in" variant="quiet" size="sm">
              {s.signIn}
            </ButtonLink>
            <ButtonLink href="/enter" size="sm">
              {s.enterCourse}
            </ButtonLink>
          </nav>
        </div>
      </header>
      <main>
        <div className="graph-paper">
          <ParticleHero>
            <section className="mx-auto flex min-h-[calc(100svh-3.5rem)] w-full max-w-4xl flex-col items-center justify-center px-6 py-20 text-center">
              <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-rule-line bg-surface/80 px-3 py-1 text-xs font-medium tracking-wide text-ink-muted uppercase">
                {s.kicker}
              </p>
              <h1 className="font-display text-7xl font-black tracking-tight sm:text-8xl md:text-9xl">
                {s.wordmark}
              </h1>
              <p className="mt-5 font-display text-2xl text-ink sm:text-3xl">{s.tagline}</p>
              <p className="mt-6 max-w-xl text-pretty text-base text-ink-muted sm:text-lg">
                {s.lede}
              </p>
              <ButtonLink href="/enter" size="lg" className="mt-10 px-8">
                {s.enterCourse}
                <Icon name="arrow-right" size={18} />
              </ButtonLink>
              {/* One quiet line, not a second door: the professor's way in
                  (decision 0075). */}
              <p className="mt-5 text-sm text-ink-muted">
                {s.teachLine}{" "}
                <Link href="/sign-up" className="font-medium text-link">
                  {s.signUp}
                </Link>
              </p>
              <p className="mt-20 max-w-prose text-pretty font-display text-base italic text-ink-muted sm:text-lg">
                {s.story}
              </p>
            </section>
          </ParticleHero>
        </div>

        <section
          aria-labelledby="practice-heading"
          className="border-t border-rule-line px-4 py-20 sm:px-6 sm:py-28"
        >
          <div className="mx-auto w-full max-w-6xl">
            <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">{s.practiceKicker}</p>
            <h2 id="practice-heading" className="mt-2 max-w-2xl font-display text-4xl sm:text-5xl">
              {s.practiceHeading}
            </h2>
            <ol className="mt-14 grid gap-px overflow-hidden rounded-xl border border-rule-line bg-rule-line sm:grid-cols-3">
              {(
                [
                  [1, s.practiceStep1Title, s.practiceStep1Body],
                  [2, s.practiceStep2Title, s.practiceStep2Body],
                  [3, s.practiceStep3Title, s.practiceStep3Body],
                ] as const
              ).map(([n, title, body]) => (
                <li key={n} className="flex flex-col gap-4 bg-surface p-7 sm:p-8">
                  <div className="flex items-center justify-between">
                    <span className="flex size-10 items-center justify-center rounded-full bg-accent-soft text-accent-text">
                      <Icon name={PRACTICE_ICONS[n - 1] ?? "sparkle"} size={18} />
                    </span>
                    {/* Decorative numerals, hidden from assistive technology
                        and drawn in field-border, which clears 3:1 for large
                        bold text in both themes (the hairline does not). */}
                    <span aria-hidden="true" className="font-display text-4xl font-black text-field-border">
                      {String(n).padStart(2, "0")}
                    </span>
                  </div>
                  <h3 className="font-display text-2xl">{title}</h3>
                  <p className="text-pretty text-sm leading-relaxed text-ink-muted">{body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="border-t border-rule-line px-6 py-20 text-center sm:py-24">
          <p className="mx-auto max-w-3xl text-balance font-display text-2xl italic leading-snug sm:text-4xl">
            {s.calm}
          </p>
        </section>

        <section
          aria-labelledby="professor-heading"
          className="border-t border-rule-line bg-surface-sunken/40 px-4 py-20 sm:px-6 sm:py-28"
        >
          <div className="mx-auto w-full max-w-6xl">
            <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">{s.professorKicker}</p>
                <h2 id="professor-heading" className="mt-2 max-w-2xl font-display text-4xl sm:text-5xl">
                  {s.professorHeading}
                </h2>
              </div>
              <ButtonLink href="/sign-up" variant="secondary">
                {s.signUp}
                <Icon name="arrow-right" size={16} />
              </ButtonLink>
            </div>
            <div className="mt-14 grid gap-x-12 gap-y-12 sm:grid-cols-2">
              {(
                [
                  [s.professorImportTitle, s.professorImportBody],
                  [s.professorVariantsTitle, s.professorVariantsBody],
                  [s.professorSeatsTitle, s.professorSeatsBody],
                  [s.professorPictureTitle, s.professorPictureBody],
                ] as const
              ).map(([title, body], i) => (
                <div key={title} className="flex gap-5 border-t border-rule-line pt-6">
                  <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md border border-rule-line bg-surface text-ink">
                    <Icon name={PROFESSOR_ICONS[i] ?? "sparkle"} size={16} />
                  </span>
                  <div>
                    <h3 className="font-display text-2xl">{title}</h3>
                    <p className="mt-2 text-pretty text-sm leading-relaxed text-ink-muted">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-rule-line px-6 py-24 text-center">
          <p className="font-display text-4xl sm:text-5xl">{s.closingLine}</p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <ButtonLink href="/enter" size="lg">
              {s.enterCourse}
            </ButtonLink>
            <ButtonLink href="/sign-in" variant="secondary" size="lg">
              {s.signIn}
            </ButtonLink>
          </div>
        </section>
      </main>
      <footer className="border-t border-rule-line px-6 py-10">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 text-sm text-ink-muted">
          <Wordmark size="sm" />
          <span>{s.footerLine}</span>
        </div>
      </footer>
    </>
  );
}
