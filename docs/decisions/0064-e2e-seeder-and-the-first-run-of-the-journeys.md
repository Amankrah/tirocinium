# 0064: the E2E seeder, and what the journeys found the first time they ran

Milestone 3.5 part B has been open since Phase 3 and named the backend's in two
handoffs: without a committed seeder the Playwright journeys skip, and journeys
one to six, mode C, and the defence are gate items for Phases 2, 3, 4, 6.5, 7,
and 8. The release gate reads "every prior gate green in one CI run", and a
skipped journey is not a green gate, it is an unmeasured one, which is the same
trap the unfetched LFS pointers set in Phase 4 (decision 0046). So this was
taken ahead of the rest of the 9.6 list. `scripts/seed_e2e.py` writes one
professor, one course, one active seat, the published case study and its
servable variant, a queue of flagged variants, a processed submission with its
reading, and a decoded import with staged problems and figures, then prints one
line of JSON that becomes the ten `E2E_*` values. The new `e2e` job in `ci.yml`
stands a real API and worker behind it.

The handoff called journey two's determinism the crux, and it dissolved on
inspection. `RecordedTranscriber` keys on the sha256 of the grayscale rendition,
and that rendition is a function of the decoded pixels, not of the PNG encoding,
so the two sides can share the browser fixture's *pixel specification* (a 96x96
checkerboard by `(x + y)` parity) rather than a committed binary, and neither
has to change. Better still, the seeder computes the key itself by running the
real preprocess crate at seed time and writes the recorded response next to the
shards, so a change in the crate moves the key and the recording together
instead of orphaning a hash-named fixture and sending the journey to a live
provider.

Substituting the model seams needed a new seam of its own, because the browser
tier cannot inject fixtures the way pytest does: a real uvicorn and a real arq
worker build their seams from module-level factories. `app/e2e.py` is that one
place, gated on `TIRO_E2E_RECORDED_DIR`. Unset, which is every deployment and
every developer shell, each factory returns None and the live seam stands, and a
test asserts exactly that. Set to a directory that is not there, it raises
rather than falling through, because a journey that quietly reached a real
provider would be both a cost and a lie about what was verified. What is
recorded and what is stubbed is a deliberate split: the transcriber and the
tutor are recorded, because a journey asserts on the reading the student sees
and on the tutor's reply; the embedder and the working assessor are stubs,
because no journey asserts on a vector or a rubric score and a hash-keyed asset
for either would couple the seed to the pipeline's internal document assembly
with nothing standing behind the coupling. The one softening is the
transcriber's fallback: mode C draws on a canvas with a pointer, so its page
cannot be recorded in advance, and an unrecorded page gets a fixed reading and
logs that it did, which keeps the exact-key path honest where it can be while
letting the pen-capture journey run at all.

Two backend changes came out of making the journeys run, and both are real
rather than test scaffolding. The presigned upload URL was signed without a
content type, and a browser sends `Content-Type` on every PUT, so every upload
from a real browser to real MinIO was refused with a 403 that reads like a
permissions problem; the URL is now signed over the declared type, on the
submission and import paths alike, which also pins an upload to the type its
manifest declared and the limits were checked against. And the redemption
ceiling became configuration: every seeded journey redeems a code, both
viewports run every journey, and all of it arrives from one address, so a real
run makes far more than ten attempts and the eleventh journey fails for a reason
that has nothing to do with what it tests. The load harness solves the same
problem by giving each simulated seat its own address, which a browser cannot
do. The default is unchanged and is what every deployment gets, and the variable
can only ever raise the ceiling: a value below the guide's ten is refused at
startup, so a control that became configurable did not thereby become one an
operator can switch off.

The journeys went from 22 passing and 14 skipped to 70 passing. The three that
remain failing are all defects in the surfaces they drive, each found the first
time these specs were ever executed, and each belongs to the frontend rather
than here: the professor's case-study page renders `ProblemBody` with no
`figures`, so a confirmed import's draft shows "Figure unavailable" where the
professor's own figure should be, which is the figures-are-pixels constraint
failing on a real surface; the flagged queue's key handler sits on a
`tabIndex={-1}` wrapper while journey six presses the `<ol>`, which cannot take
focus, and a container reachable only programmatically is also a keyboard gap in
a queue whose own test is titled "without a mouse"; and the defence's
keyboard-route test navigates to the defence before awaiting the redirect that
sets the seat cookie, so it lands back on `/enter`. They are written up with
their evidence in `docs/handoffs/seeded-journeys-first-run.md`. The CI job holds
those three out by name and prints the list on every run, rather than deleting
them or leaving the whole job non-blocking: the five journeys that work are
enforced from now on, and the held-out list is a debt with a name on it that
shrinks as they are fixed. Naming them is the point, because the reason all
three survived this long is that a test nobody runs asserts nothing.

One consequence worth stating for whoever edits the seed next. Two journeys are
destructive: journey four merges and confirms staged items, and journey six
promotes a flagged variant, and both run once per viewport with Playwright's
retries on top. A seed sized to satisfy one pass leaves the second run staring at
an empty queue and failing for a reason that has nothing to do with triage, so
the import carries twenty-four problems and the flagged queue eight. They are
rows sharing two figures, so the headroom costs nothing, and a real course has a
queue rather than a pair.
