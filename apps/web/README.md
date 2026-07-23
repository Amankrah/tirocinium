# apps/web

The Next.js 15 frontend (App Router, TypeScript strict, Tailwind v4 on the
token layer in `src/styles/tokens.css`), owned by the frontend engineer and
specified in `docs/frontend-development-guide.md`. Scaffolded in full at the
close of Phase 0 (decision 0005); its build order follows the frontend guide's
section 8 through the phases document's gates.

Commands (pnpm, from this directory): `dev`, `build`, `lint` (eslint),
`typecheck` (tsc, after a build on fresh checkouts, see decision 0005), and
`test` (Vitest with Testing Library). CI runs all of them in the `web` job.

The contract seam is live: `pnpm generate:client` regenerates
`src/lib/api/schema.ts` from `../api/openapi.json`, and CI fails if either
committed artifact is stale (decision 0003). After any backend route change:
regenerate the spec in `apps/api` (`python scripts/export_openapi.py`), rerun
`pnpm generate:client` here, commit both. The generated `schema.ts` is never
hand-edited and is excluded from lint.

## Server-side API access

Surfaces that carry a credential (seat redemption, professor sign-in, the
authenticated landings) call the backend server-side, never from the browser:
the token is set as an httpOnly cookie (decisions 0011, 0012) and read by Server
Components. Those calls use `API_BASE_URL` (server-only env, default
`http://localhost:8000`); it is never a `NEXT_PUBLIC_` var, so it never ships to
the client. There is no professor signup screen yet; create accounts via
`POST /api/v1/auth/signup` until that product question is decided (0012).

## End-to-end and Lighthouse harness (Phase 2 gate)

- `pnpm test:e2e` runs the Playwright journeys on desktop and mobile viewports
  (`playwright.config.ts`); each shipped surface also carries an axe WCAG 2.2 AA
  check (`e2e/axe.ts`). It runs against the dev server and needs no backend: the
  entry surfaces are exercised through their honest failure paths. First run on
  a fresh checkout needs the browser: `pnpm exec playwright install chromium`.
- `pnpm lighthouse` runs Lighthouse CI against a production build with the guide
  section 5 budgets (`lighthouserc.json`). It needs a Chrome binary; if none is
  on the machine, point it at Playwright's: set `CHROME_PATH` to the path from
  `pnpm exec playwright install chromium`. Run `pnpm build` first (a `dev` run
  replaces `.next` and `next start` then has no production build).
- Journey one (`e2e/journey-one.spec.ts`) drives both halves end to end through
  the UI against a real backend: a professor signs in, opens their course,
  writes a case study with typeset math, and publishes it, then a seat redeems a
  code, opens the same course, and reads that case. It skips unless
  `E2E_PRO_EMAIL`, `E2E_PRO_PASSWORD`, `E2E_COURSE_TITLE`, and `E2E_SEAT_CODE`
  are set. What the seed still provides, because none of it has a UI: the
  professor account (no signup screen yet, decision 0012), the course owned by
  that professor, and one active seat scoped to it. The API only ever exposes
  seat codes through object-storage artifacts, so seeding for a browser test
  writes the shards directly (one professor, one course, one active seat) and
  prints the plaintext code; a committed, CI-ready seed helper belongs with the
  backend session, so that it stays under the backend gate. To run it: start the
  API, seed those three, export the four values, then `pnpm test:e2e`.
- Journeys two and three (`e2e/journey-two.spec.ts`, `e2e/journey-three.spec.ts`)
  cover the upload flow (guide 4.1) on both viewports and skip unless
  `E2E_SEAT_CODE`, `E2E_CASE_STUDY_ID`, and `E2E_VARIANT_ID` are set. The seed
  provides a seat, a published case study, and a variant to file against
  (exposing a variant to the problem view is Phase 5, decision 0019, so the
  upload surface is reached directly at `/course/{id}/upload?variant={id}`).
  Journey two is the happy path (add a page, send, watch it process to "read")
  and also needs the transcription worker running against recorded responses so
  the submission reaches "processed". Journey three is the client-side blur
  pre-check and retake, which needs only the seat and variant, not the worker,
  because the page is flagged in the browser before any upload; its page
  fixtures are valid PNGs built in-test (`e2e/fixtures.ts`), so no binaries are
  committed. Still blocked: the transcription preview beside the thumbnails
  (guide 4.1, step 4) waits on a backend read endpoint for the recognized
  markdown and per-region spans, which `GET /submissions/{id}` does not yet
  return.
- Deferred until the course-home and problem-view surfaces have production
  content to measure: the Lighthouse runs on those two routes.
- Not yet wired into CI: the `web` job additions (a `test:e2e` step and an
  `lhci` step) are left to add together with the backend session to avoid
  concurrent edits to the shared workflow. Note that on very throttled runners
  the LCP budget (1.8 s mobile) can be exceeded by the display-font render on
  otherwise-trivial text pages even with an idle main thread; confirm on the
  real CI runner before making the LCP assertion blocking.
