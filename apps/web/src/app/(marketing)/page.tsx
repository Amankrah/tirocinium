import { strings } from "./strings";

// Landing placeholder: wordmark and tagline only, server-rendered, no client
// JavaScript. The real hero (display face, particle field) is Phase 2.2 and
// Phase 9.5 work; this page exists so the app builds, routes, and gets a
// baseline Lighthouse figure from day one.
export default function LandingPage() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4">
      <h1 className="font-display text-6xl font-black tracking-tight">
        {strings.wordmark}
      </h1>
      <p className="text-lg">{strings.tagline}</p>
    </main>
  );
}
