# Handoff: wiring the e2e, axe, and Lighthouse gate into CI

**Status: all three parts landed.** Parts A and C are the `web-e2e` and
`web-lighthouse` jobs (frontend session, after milestone 7.4), rather than steps
inside `web`, because Playwright starts `next dev` and would replace the
production build Lighthouse needs. Both were run locally exactly as CI runs them
(`CI=true pnpm test:e2e`: 22 passed, 14 skipped; `pnpm build && pnpm lighthouse`:
green, with LCP warning only).

**Part B landed with decision 0064** (backend session) as the `e2e` job: the
committed seeder is `apps/api/scripts/seed_e2e.py`, and the job stands a real
API and worker behind the journeys with MinIO and Redis from the compose file.
The journeys now run rather than skip, 22 passing and 14 skipped becoming 70
passing. Three fail on defects in the surfaces they drive and are held out of
the job by name until fixed; they are written up with their evidence in
`seeded-journeys-first-run.md`, and they are the frontend's.

The determinism problem part B describes below turned out not to exist: the
recorded transcriber keys on the grayscale rendition, which is a function of the
decoded pixels rather than of the PNG encoding, so both sides derive from the
browser fixture's pixel specification and no committed binary or frontend change
was needed. The seeder computes the key by running the real preprocess crate and
writes the recording beside the shards.

From the frontend session, for the joint `ci.yml` edit. The Phase 2 and 3
Playwright/axe/Lighthouse harness exists and passes locally, but the `web` job
still runs only `lint`, `test`, `build`, `typecheck`, so none of it has ever
gated a build. This is the plan to make it enforce, in three parts of rising
cost. `ci.yml` is shared and we have collided on it before, so land these
together rather than concurrently.

## Part A: the browser specs and axe, no backend (land now)

The entry-surface specs (`landing`, `seat-entry`, `professor-sign-in`,
`session-guards`) and their axe WCAG 2.2 AA checks run against the dev server
with no backend, through their honest failure paths; the seeded journeys skip.
So this enforces axe and the entry flows immediately. Add to the existing `web`
job, after `pnpm build`:

    - run: pnpm exec playwright install --with-deps chromium
    - run: pnpm test:e2e

Playwright starts `next dev` itself (`playwright.config.ts`), so no server
wiring is needed. This is frontend-only and safe to enforce today.

## Part B: the seeded upload journeys (extends the journey-one handoff)

Journeys two and three (`e2e/journey-two.spec.ts`, `e2e/journey-three.spec.ts`)
need the seed the journey-one handoff already specifies, plus two additions,
because a seat cannot mint a case study or a variant from the browser:

- The seeder (`scripts/seed_e2e.py`) also seeds one published case study in the
  course and one variant of it, and adds `case_study_id` and `variant_id` to its
  JSON line. The frontend maps them to `E2E_CASE_STUDY_ID` and `E2E_VARIANT_ID`
  and reaches the upload surface at `/course/{case_study_id}/upload?variant={variant_id}`.
- Journey three (client-side blur reject and retake) needs only that seat and
  variant; it never uploads, so no worker. Journey two (happy path) needs the
  transcription worker running against recorded responses so the submission
  reaches `processed`.

The crux for journey two is determinism: `RecordedTranscriber` keys on the
sha256 of the *grayscale rendition* the worker produces, i.e. the frontend's
page fixture after the real Rust preprocess. So the recorded response must be
generated from the exact bytes the journey uploads. The frontend currently
builds that page in-test (`e2e/fixtures.ts`, a 96x96 grayscale checkerboard) so
no binary is committed. The clean resolution is a single shared committed page
fixture that both sides derive from: the journey uploads it and the backend runs
it once through `preprocess` to compute the key and commits the recorded
`{sha256}.json` beside the corpus. The frontend will switch journey two to read
that committed fixture if you prefer that over reproducing the checkerboard
spec; tell us which and we will align. Until this is settled, keep journey two
skip-gated (it already is) so Part A stays green.

Structure the seeded run as the `e2e` job the journey-one handoff describes
(fresh `TIRO_DATA_DIR`, background uvicorn on `127.0.0.1:8000`, seeder JSON into
`E2E_*`), adding the worker process for journey two and the two new env values.

## Part C: Lighthouse, and the LCP decision that cannot be silent

Add an `lhci` step (after a production `pnpm build`):

    - run: pnpm build
    - run: pnpm lighthouse

But it will fail as configured, and only on one assertion. Of the four budgets
in `lighthouserc.json`, three pass on the shipped surfaces: accessibility is
1.0 (after the muted-token contrast fix, decision 0017), total-blocking-time is
under 200 ms, and script size is under 170 kB. Only `largest-contentful-paint`
fails, at ~2.2 s against the 1.8 s budget.

That failure is real and reproduces under CI's own lantern model, but it is not
a page defect: observed (unthrottled) LCP is ~50 ms, and the simulated figure is
dominated by the Next 15 / React 19 framework baseline JS plus one render-blocking
CSS file on the simulated Slow-4G critical path, not by anything on the page.
Neither preloading the display font nor `font-display: optional` moved it (both
tried and measured). The frontend guide (section 5) does explicitly target
"LCP under 1.8 s on simulated mid-range mobile", so this is a genuine tension
between two things the guide asks for (that budget and the framework it also
specifies), and it must be resolved out loud, not by quietly dropping the
assertion.

Two honest options, and a recommendation:

1. Ship Lighthouse with `largest-contentful-paint` set to `warn` (the other
   three stay `error`), record a decision that says why, and keep a tracked task
   to either bring LCP under 1.8 s (a real framework-JS reduction, e.g. inlining
   critical CSS and trimming the baseline) or, if that proves impossible for a
   content route that carries the specified display face and framework, flag the
   guide-internal conflict and recalibrate the budget with the guide owner. This
   enforces the three budgets that pass *today* while being truthful about LCP.
2. Hold Lighthouse out of CI entirely until LCP is under budget. This keeps the
   gate all-or-nothing but leaves accessibility, TBT, and the script budget
   unenforced in the meantime, which is the worse of the two.

Decided: option 1, with the human lead's sign-off (decision 0022).
`lighthouserc.json` now sets `largest-contentful-paint` to `warn` and keeps
accessibility, total-blocking-time, and script size at `error`; `pnpm lighthouse`
was confirmed to exit 0 (LCP reports as a warning, the other three pass). So the
`lhci` step above lands green as-is. The tracked follow-up (reduce framework JS
or recalibrate the budget with the guide owner) stays open, and decision 0022
notes the budget is revisited when the particle hero ships, since that gate
requires every budget actually green.

## Sequencing

Part A can land the moment we do the joint `ci.yml` edit; it needs nothing from
the backend. Part B rides on the extended seeder. Part C needs the LCP decision
first. When any part lands, update the `tirocinium-testing` skill's gate table
(the journey and Lighthouse items move from "the frontend's to close" to live CI
jobs) and the `web` README.
