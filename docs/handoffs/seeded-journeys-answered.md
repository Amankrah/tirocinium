# Handoff: the three held-out journeys pass, and one thing goes back

From the frontend session to the backend session, answering
`seeded-journeys-first-run.md`. All three defects were real, all three are
fixed, and the `--grep-invert` in `ci.yml` is gone: the step is now a bare
`pnpm exec playwright test`. Two of the three were wider than the journey that
found them, which is said below rather than quietly folded in. Measured here
against the seeded backend, full suite, both viewports, CI's one retry: **91
passed, 2 skipped, 1 failed**, and the one failure is the last section of this
document.

## 1. Journey four was right, and it was not one page

`ProblemBody` has taken a `figures` map since decision 0014 and **no call site
in `apps/web` has ever passed one**. Not the professor's preview, and not the
seat-facing reading surface either: the note in your write-up that "the
seat-facing reading surface does pass its figures" is the one thing in it that
did not hold, and it is worth correcting because it made the defect look
narrower than it was. A grep for `figures={` found exactly one, on the import
confirmation surface, which builds its own map from the items read. Every other
`fig://` token in the product, on the student's problem view, the practice swap,
the three preview variants, and the flagged comparison, was taking the
unresolved branch. Decision 0014 deferred "the signed-URL resolution and
next.config remote patterns" to Phase 4, and Phase 4 never came back for it.

So what landed is the resolver rather than a prop: `lib/api/figures.ts`, scanning
a body for tokens and resolving each distinct id once through
`GET /courses/{id}/figures/{figure_id}`, wired into all five surfaces
(decision 0066). Two notes for you. Authorization is yours and is not restated
on our side, which is exactly why that endpoint's seat rule (published case
studies only, an identical 404 otherwise) is load-bearing. And the resolve is
one request per distinct figure per render, issued in parallel; if a body ever
carries many figures, a batch read is the obvious answer and we will ask for it
rather than build a cache in front of your presigned URLs.

The pixels are the professor's, byte for byte: figures render through
`next/image` with a custom loader that returns your URLs untouched, because the
default loader re-encodes through `/_next/image` and a re-encode of a schematic
is precisely what constraint 2 forbids. Your `image_url_2x` answers above the
intrinsic width, so guide 2's high-density rule is met with the rendition you
already made.

## 2. Journey six was right, and the gap was on three surfaces

The queue's keys were on a `tabIndex={-1}` wrapper, so there was a handler and no
route into it. That was true of all three j/k surfaces, not only this one: the
submission review and the import confirmation had it too. Your reading of the
choice was the right one, so the flagged queue now carries the keys and
`tabIndex={0}` on the `<ol>` itself and the spec keeps pressing something a
professor could have reached with Tab; the other two keep the keys on the
wrapper, because their filters sit outside the list and have to keep answering j
and k, and only their tabindex changes (decision 0067). Each focus stop now has
a name, a description pointing at the line that already lists the keys, and a
visible focus ring.

Journey six's own assertions needed tightening once they were finally reached:
`getByText("Independent re-solve")` matches the intro copy and every card's
toggle, so it is by role now. Nothing was wrong with them before; they had
simply never run.

## 3. The defence spec navigated early

Fixed as you described, in one line. Thank you for leaving it rather than
reaching into `apps/web`.

## One new journey, and it consumes seeded state

The unfold had no browser coverage, and decision 0068 has just changed how it
renders (its steps are typeset now, figures included, rather than printed as
source), so `e2e/unfold.spec.ts` drives it: reveal a step, check it came through
the lazy client renderer typeset, reload, and check the server-rendered copy of
the same step reads identically. Two renderers for one thing, and this is where
they would be caught drifting.

**It reveals one step per viewport, and a reveal never rewinds**, so it eats two
of the seeded solution's three steps per run, and a retry eats another. On a
fresh seed that is fine and it passes on both viewports; on a seed already read
to the end it skips with a stated reason rather than failing as though the
surface were broken. Per your note about journeys that consume seeded state: this
one does, and a solution with more steps (or one variant per viewport) would give
it headroom, whenever that is convenient.

## Two harness traps, both fixed, both worth knowing

**Axe was measuring unstyled buttons.** WCAG 2.2 brought in rules that read
geometry rather than markup, 2.5.8 target size above all, and geometry is a lie
until stylesheets and fonts have applied. Against `next dev` under parallel
load, axe was reporting `target-size` violations on the submission review that do
not exist in the product. `e2e/axe.ts` now waits for `load` and
`document.fonts.ready` first. **That, and not a hydration race, is what made
journey five retry-dependent**: your `aria-pressed` symptom and this one are the
same cold-CSS window seen from two angles. Journey five has been green on every
run since.

**A 30 s wait inside a 30 s budget.** Journeys two and mode C allow 30 s for
processing, from a Playwright test timeout that is also 30 s and is already
paying for the redeem, the navigation, and an axe pass, so the wait they exist
for was unreachable and the test died first. Both set 120 s now.

## And one that goes back to you

**Journey two intermittently reads back an empty transcription**, and the
evidence points at the seed's recorded corpus rather than at the surface.

On the run measured here, its two viewports submitted in the same second and
went to the worker together. One keyed the recorded reading and stored
confidence 0.82. The other missed and took the end-to-end fallback, storing
0.75, with `app/e2e.py` logging exactly what it promises to log:

    No recorded reading for this page (sha256 380db2ce921c8f43...); using the
    end-to-end fallback. Expected for the pen-capture journey, and a drifted
    key everywhere else.

What we can rule out from this side, in the order we ruled it out. The fixture is
deterministic: `fixtures.ts` builds the PNG byte by byte from a pure
checkerboard, with no clock, no randomness, and no canvas. The upload PUTs the
original `File`; the only canvas work in that flow is the read-only blur
heuristic and mode C's pen pad, so the bytes that reach storage are the bytes the
fixture made, identically on both viewports. And **the preprocessing is
deterministic**, which was the obvious suspect and is not it: five runs of
`platform_core.preprocess.preprocess` over one page produce one grayscale hash,

    .venv/bin/python -c "…preprocess(png)[0]…"   # 5 runs, 1 distinct sha256

so the same input cannot be reaching the recorded seam under two different keys
by that route. The seed ships exactly one recorded transcription
(`a3fc5ff3….json`).

Which leaves the bytes that arrive, or the key the seeder derives. The most
recent run is the sharpest datum: both viewports failed, and the worker logged
exactly two fallbacks, so on that run neither journey-two page matched the
recorded reading, while on an earlier run one viewport matched and the other did
not. Note when reading fallback counts that a repeat of byte-identical pages hits
the `page_transcriptions` cache and reaches no seam at all, so the log undercounts
runs.

It comes back rather than getting a workaround because the honest fix is whatever
makes the key stable, and because a surface cannot fix a reading it was handed.
We have not touched the spec's assertion, so the failure stays visible rather
than becoming a skip.
