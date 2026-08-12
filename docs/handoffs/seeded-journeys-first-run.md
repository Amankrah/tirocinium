# Handoff: the seeded journeys now run, and three of them fail

From the backend session to the frontend session. Part B of
`e2e-and-lighthouse-ci.md` has landed (decision 0064): `apps/api/scripts/
seed_e2e.py` writes the world the journeys need, the new `e2e` job in `ci.yml`
stands a real API and worker behind them, and the specs you wrote are executing
for the first time. They went from 22 passing and 14 skipped to **70 passing**.

Three fail, and all three are defects in the surfaces they drive rather than in
the seed. That is not a complaint: it is what the milestone was for, and none of
them could have been found by a spec that skipped. Each is reproduced below with
the evidence, so you are not starting from a red tick.

The CI job holds these three out **by name** and prints the list on every run.
Delete a line from that `--grep-invert` expression as you fix each one; the list
is meant to shrink to nothing.

## Running them yourself

From `apps/api`, with MinIO and Redis up
(`docker compose -f infra/docker-compose.yml up -d --wait`):

    rm -rf /tmp/e2e-data
    TIRO_DATA_DIR=/tmp/e2e-data .venv/bin/python scripts/seed_e2e.py --reset

That prints one line of JSON whose keys map to the `E2E_*` variables
(`pro_email` to `E2E_PRO_EMAIL`, and so on: ten of them now, including
`course_id`, `flagged_case_study_id`, `import_id`, and
`defence_submission_id`). Then start the API and the worker with
`TIRO_DATA_DIR`, `TIRO_JWT_SECRET`, `TIRO_REDIS_URL`,
`TIRO_E2E_RECORDED_DIR=/tmp/e2e-data/e2e-recorded`, and
`TIRO_SEAT_REDEEM_MAX_ATTEMPTS=500`, export the `E2E_*` values plus
`API_BASE_URL=http://127.0.0.1:8000`, and run `pnpm test:e2e` from `apps/web`.
The `ci.yml` `e2e` job is the exact recipe if you would rather read it there.

`TIRO_E2E_RECORDED_DIR` is what makes the tutor and the handwriting reader
answer from a script instead of a provider. Without it they are live; with it
pointed at nothing, the process refuses to start rather than falling through to
a real model. No API keys are configured in CI, so a regression in that wiring
fails the job rather than spending money.

## 1. Journey four: the confirmed draft shows "Figure unavailable"

`apps/web/src/app/(professor)/courses/[courseId]/case-studies/[caseStudyId]/page.tsx`
renders `<ProblemBody body={caseStudy.body} />` with no `figures` prop. Every
`fig://` token therefore takes `problem-body.tsx`'s unresolved branch, so the
professor's own extracted figure renders as the amber "Figure unavailable"
placeholder. Measured on the draft a confirmed import item creates: **0 `img`
elements, 1 "Figure unavailable"**.

This is worth more than a failing assertion. The standing rule is that figures
render exactly as extracted at their token position *on every surface*, and this
is a professor looking at a draft of their own problem and being told the figure
is unavailable when it is sitting in storage and resolves fine
(`GET /courses/{id}/figures/{figure_id}` returns a presigned URL for an owner;
the API-level check passes). The seat-facing reading surface does pass its
figures, so this looks like the professor page having been written before the
resolver existed and never revisited.

Journey four's last assertion (`page.locator("img").first()` visible) is
correct and should stay as it is; everything before it, including the box draw,
the merge, and the confirm, already passes against the real backend.

## 2. Journey six: the queue's key handler cannot take focus

`review-queue.tsx` puts `onKeyDown` on a `<div tabIndex={-1}>` that wraps the
`<ol>`. The spec does `page.locator("ol").first().press("Enter")`, and an `<ol>`
has no tabindex, so Playwright cannot focus it, the key event never reaches the
handler's subtree, and nothing opens. Clicking the same card with a mouse opens
the comparison correctly and renders both solutions, so the surface and the seed
are fine and only the route into the keyboard model is not.

Two things to weigh rather than one. The spec could press the focusable wrapper.
But `tabIndex={-1}` also means the container is reachable only programmatically:
a professor arriving by keyboard cannot Tab to the queue and start pressing j
and k without clicking something first, which sits badly with guide 6's
keyboard-operability floor and with the test's own title, "without a mouse". A
`tabIndex={0}` with a visible focus style would fix the journey and the gap
together, and would let the spec keep pressing something a user could actually
reach.

## 3. The defence's keyboard route navigates before the cookie is set

`defence.spec.ts:72` fills the seat code, clicks "Enter course", and then goes
straight to `page.goto(/course/{id}/defence/{id})` without awaiting the
redirect. The first test in the file awaits `expect(page).toHaveURL(/\/course$/)`
and passes; this one does not and lands back on `/enter`, so "Start talking"
does not exist and `start.focus()` times out.

Proven both directions in one run against the seeded backend:

    without the await:  URL /enter,                      "Start talking" count 0
    with the await:     URL /course/1/defence/1,         "Start talking" count 1

So this is a one-line fix in the spec. It is listed here rather than fixed
because `apps/web` is yours and a spec is a statement about your surface.

## Also worth knowing

**Journey five is flaky under parallel load.** It passes three times out of
three when run alone and flakes when desktop and mobile run together, always on
the same assertion: `aria-pressed` on "Original photo" is still `false` after the
click. It reads like the click landing before the client island has hydrated.
It passes on retry, so CI is green on it today, but a retry-dependent gate is a
gate that will eventually bite.

**Two journeys are destructive, which shapes the seed.** Journey four merges and
confirms staged items; journey six promotes a flagged variant. Both run once per
viewport with retries on top, so each consumes state that does not come back.
The seed now carries twenty-four staged problems and eight flagged variants for
that reason. If you add a journey that consumes seeded state, say so and the
seed will be sized for it: they are rows, and the headroom is free.

**One backend bug the journeys found, now fixed.** The presigned upload URL was
signed without a content type, so a browser PUT (which always sends
`Content-Type`) was refused by MinIO with a 403. Journey two failed on it, and
so would every real student upload. It is signed over the declared type now, on
the submission and import paths alike, and no frontend change is needed.

**And one control that is now configurable.** Every seeded journey redeems a
seat code from the same address, which is well past the ten-per-hour ceiling, so
`TIRO_SEAT_REDEEM_MAX_ATTEMPTS` exists. It can only raise the ceiling, never
lower it, and the default is untouched.
