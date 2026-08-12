import { ButtonLink } from "@/components/ui/button";
import { ParticleHero } from "@/components/particles/hero";
import { strings } from "./strings";

// Landing: wordmark, tagline, and the single Roman-story line (frontend guide
// 3.1). The two doors sit in a header over the hero (decision 0065), so the
// brand moment stays centred and quiet. The text is server-rendered and is the
// LCP element; the particle field mounts behind it.
export default function LandingPage() {
  return (
    <ParticleHero>
      <header className="absolute inset-x-0 top-0 z-10 flex items-center justify-center px-6 py-5">
        <nav aria-label={strings.doors} className="flex items-center gap-3">
          <ButtonLink
            href="/enter"
            variant="quiet"
            className="border border-field-border px-5"
          >
            {strings.enterCourse}
          </ButtonLink>
          <ButtonLink href="/sign-in" className="px-5">
            {strings.signIn}
          </ButtonLink>
        </nav>
      </header>
      <main className="flex min-h-svh flex-col items-center justify-center px-6 text-center">
        <h1 className="font-display text-6xl font-black tracking-tight">
          {strings.wordmark}
        </h1>
        <p className="mt-4 text-lg">{strings.tagline}</p>
        <p className="mt-3 max-w-prose text-pretty text-sm text-ink-muted">
          {strings.story}
        </p>
      </main>
    </ParticleHero>
  );
}
