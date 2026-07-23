import { strings } from "./strings";

// Landing: wordmark, tagline, and the single Roman-story line (frontend guide
// 3.1), server-rendered with no client JavaScript. The signature particle-field
// hero ships last on purpose (build order item 6: the bow on a finished
// package), so until then this stays deliberately quiet. Almost no one lands
// here in normal use: students go straight to /enter with a code, professors to
// /sign-in; the page exists so the app builds, routes, and holds a baseline
// Lighthouse figure.
export default function LandingPage() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="font-display text-6xl font-black tracking-tight">
        {strings.wordmark}
      </h1>
      <p className="text-lg">{strings.tagline}</p>
      <p className="mt-2 max-w-prose text-pretty text-sm text-ink-muted">
        {strings.story}
      </p>
    </main>
  );
}
