---
name: tirocinium-conventions
description: Tirocinium coding standards, API conventions, data-layer rules, and the inviolable product constraints. Use in every backend session before writing or reviewing code, and whenever a design choice touches figures, student identity, shards, or AI-generated content.
---

# Tirocinium conventions

The four documents in `docs/` are the specification and outrank this skill; this
skill is the operational digest that survives context windows. Last updated for
Phase 8 (data layer, auth, seats, and the authoring backend done; the
handwritten solution upload path live; scan preprocessing implemented in Rust;
handwriting transcription running in an off-request-path worker with a recorded-
response model seam and SSE progress; indexing and retrieval done, with FTS5 and
int8-quantized embeddings behind a provider seam and hybrid retrieval over them.
The Phase 3 backend is complete; 3.5 and the end-to-end gate are the frontend's.
Phase 4 has begun: 4.1 decode is complete, the PDF import handshake, the decode
worker, and the real `tirocinium-pdf` member binding pdfium over a vendored
native binary; 4.2 figure extraction the deterministic detector done, embedded
rasters byte-identical and vector drawings rendered, stored content-addressed
with fig:// tokens in the page markdown; 4.3 segmentation done, a fidelity-strict
model pass staging items with the 30-day purge, the vision figure detector
closing Stage 1b's union with scanned-page page_crop figures, the 4.4 confirm
endpoint copying a staged item into a draft case study, 4.5 logging the two
extraction-accuracy metrics at confirmation, three figure verbs (decorative,
reassign, add-a-box), figure and source-page image serving, and the item verbs
merge and discard (decision 0034) built, and the five-PDF golden-corpus harness
completed (decision 0033, awaiting its captured PDFs). The Phase 4 backend is
complete bar item/figure split, which alone needs re-cropping from the lossless
source and is deferred with the figure re-crop follow-up (decision 0031).
Phase 5 has begun: 5.1 (the parameter spec and the figure-frozen check),
5.2 (auto-parameterization), 5.3 (generation and verification, with the
`tirocinium-compare` member), and 5.4 (the variant pool) are done; 5.5 is the
frontend's. The Phase 6 backend is complete (6.1 to 6.3, decisions 0040 and
0041): the mastery model is live, evidence flows from the pipeline, and 6.4
(the mastery picture, revisit queue, and distribution surfaces) is the
frontend's. Phase 6.5 (student input modes, decision 0026): 6.5.1 (mode B,
the exported handwriting PDF) is done; 6.5.2 (pen capture) and 6.5.3 (the
unified submission surface) are the frontend's, reducing to modes A/B on the
backend. The Phase 7 backend is complete (7.1 to 7.3, decisions 0043 and
0044): the voice defence runs as a modular recognition, Claude, synthesis
pipeline behind swappable seams, and 7.4 (the conversation module) is the
frontend's. Phase 8 has begun: 8.1's backend read is done (decision 0047, the
professor's submission review), 8.2 landed early during 5.5, 8.3 (course
reporting, decision 0048), 8.4 (the understanding unfold and the personal
history, decision 0049), and 8.5 (observability, decision 0050) are done, so
the whole Phase 8 backend is complete and only the frontend's journeys five and
six remain on its gate. Phase 9 has begun: 9.1 (load testing, decision 0051) and
9.2 (the security pass, decision 0052) and 9.4 (the scheduled backup drill with
alerting, decision 0053) are done; 9.3 and 9.5 are the frontend's and 9.6 is the
discretionary list. Backups are verified as well as drilled: `verify_snapshots`
in `app/db/backup.py` fails a shard whose newest snapshot is missing, older than
36 h, or zero bytes, and shard discovery comes from the data directory so a new
course reports as unbacked rather than going unnoticed.

Untrusted text never goes into a prompt by hand (milestone 9.2, decision 0052).
`app/prompt_safety.py` is the only way: `new_fence()` once per assembled
document, then `fence.wrap(text)` around every block the platform did not write.
The fence markers carry a random per-document nonce because the previous fixed
markers were forgeable: a page that wrote `content>>>` closed the fence and
escaped into the document's own voice, which the red team found and this fixed.
Recorded-response seams key on `document_key(document)`, which canonicalises the
nonce out, so production keeps a fresh fence on every assembly while replays stay
deterministic; a new model seam that hashes the raw document will never match a
recording. Every prompt that reads untrusted text states the hostile-text rule in
its own words, and a test enumerates them, so a new prompt that forgets fails.

Observability (milestone 8.5, decision 0050) lives in `app/telemetry.py` and
nowhere else: JSON logs (one object per line, trace and span id attached, extra
context passed as `extra=`), spans, the W3C carrier, and the four dashboards'
instruments. Rules that hold. Spans at the Rust boundary are opened on the
Python side around the PyO3 call (`native_span`), covering the native call and
nothing around it, and the codec is deliberately uninstrumented because a span
per compressed blob makes a trace less observable, not more. Every enqueue
carries `trace_context` and `worker.run_job` resumes it, so a submission's
lifecycle is one trace; the keyword has a default and an unparseable carrier
starts a fresh trace, because losing continuity must never lose the work, and
`run_job` is the single place jobs get instrumented so a new job never has to
remember. No metric label carries an identifier: API latency is labelled by
matched route template, never path, and nothing about a seat is a dimension
anywhere. Logs and spans carry seat and course ids, never a seat code, which is
a credential. The dashboards are committed data (`infra/dashboards.json`),
reviewed like code, and a test pins that every panel queries an instrument the
code actually emits. With no `TIRO_OTEL_ENDPOINT` the SDK still creates spans
and drops them, so dev and production run identical code paths.

The understanding unfold (milestone 8.4, decision 0049) splits a worked
solution into steps deterministically in Python (`app/unfold/steps.py`), never
by a model: a model asked to "break this into steps" would paraphrase or
renumber, which is the same rewriting the import pipeline forbids. The split
only cuts (markdown block boundaries and top-level list items; fenced code and
display math are atomic; a bare heading joins the block it introduces), and the
fidelity property is mechanical: spans are ordered, non-overlapping, exactly the
step text, and separated only by whitespace, so a `fig://` token stays inside
its step at the position the professor put it. The solution is earned, not
browsed: `GET .../variants/{id}/solution` opens once a seat has submitted for
that variant or deliberately given up, `POST .../solution/reveal` takes an
absolute `through_step` (a retry never rewinds), and a first reveal without a
submission records `gave_up` in `solution_reveals` (migration course/0019),
because the platform never records a solution as earned by work that did not
happen. The step numbering is shared with the tutor: the defence context carries
the reference solution numbered in the same numbering the student unfolds plus a
line stating how far they have read, so a step sent into the conversation lands
where the student meant it and the never-reveal rule has a precise line (a step
already unfolded is theirs to discuss, everything past it is not). That changed
what ships to the model, so the persona is `defense-tutor/v2`. The personal
history (`GET .../history`) is seat-only like the mastery picture, newest first;
a professor reads the class through the 8.3 reporting surfaces, never through a
student's own view. A variant's stored solution is read back through
`app/variants/solution.py`, which tolerates both the 5.3 JSON blob and bare
markdown, and is the one implementation both the unfold and the tutor use.

Course reporting (milestone 8.3, decision 0048) is four professor-and-owner
reads under `/api/v1/courses/{id}/reports/` (`app/reports/`), lenses over rows
the pipelines already write, so no new table and no migration: `/activity`
(every seat by number with submissions, graded, defences, and last submitted,
the roster joined to the shard's counts in Python), `/usage` (`token_usage` and
`speech_usage` by kind and model, `?since=`), `/health` (the two guide-section-8
product-health metrics: recognition confidence in ten buckets, and the variant
verification pass rate over verified and flagged only, since a manual variant is
the professor's own call), and `/rubric-agreement` (the mastery spec section 10
calibration loop: each closed conversation's validated rubric paired with the
grade on its submission, reported as means, the signed bias where positive means
the tutor read more generously, the mean absolute difference, and Pearson's r).
Two standing rules here. Prices are configuration and never code: no rate ships,
`TIRO_MODEL_PRICES` and `TIRO_SPEECH_PRICES` supply them, and with none
configured the reports carry real usage with null costs and `priced: false`,
because an invented number in a cost report is worse than no number. And a
statistic with an empty denominator is null, never zero: no pairs, one pair, a
zero-variance series, and a course with no machine-verified variants all report
null rather than a figure that reads like a finding. Activity is ordered by seat
number and never by volume, because a report sorted by who did most is the
per-seat ranking lens spec section 6 rules out.

Submission review (milestone 8.1, decision 0047) is the professor's read of the
same submissions the seat endpoints serve, and it is a separate course-scoped
router (`app/submissions/review.py`, professor-and-owner through
`ensure_course_owner`) rather than a role branch inside the seat reads:
`GET /courses/{id}/submissions` is the review queue (cursor-paginated,
`?status=` and `?variant_id=` filters, each row carrying the seat number, the
case study, mean recognition confidence, and the grade already given),
`GET .../submissions/{id}` puts the scan beside the transcription (per page the
presigned original, the grayscale rendition the model read, and the reading with
region boxes and per-region confidence, which is what hover-linking and
low-confidence highlighting are built from), and
`GET .../submissions/{id}/pages/{n}` reissues one page's presigned URLs, since
they are short-lived and a review session outlives them. Grading is unchanged
(the 6.2 endpoint, because a grade is evidence first). The variant's body and
reference solution are not duplicated here; `GET /courses/{id}/variants/{id}`
serves both and the detail carries the `variant_id`. Seat numbers live in the
directory and submissions in the shard, so that join happens in Python, never in
SQL, and the seat number is the only thing about a student on the surface.

Mode B (milestone 6.5.1): the submission pipeline expands an
`application/pdf` page before the page loop, behind the same `PdfDecoder`
seam the import pipeline uses: bytes rendered to rasters (always the raster,
never a text layer), the page-count and size limits re-enforced against the
rendered result (over-limit fails with the stated copy; limits live in the
dependency-free `app/limits.py`, shared with the upload surface), rasters
stored under the submission prefix, and the page rows rewritten in one writer
transaction as ordinary image rows re-sequenced in place. Idempotent (no PDF
row survives expansion), and downstream is untouched: cache keyed on the
rendered bytes, same preprocess, vision read, SSE, indexing, and evidence, so
the mode is invisible (the parity gate asserts it).

Mastery integration (Phase 6): all writes to evidence_events and
mastery_state go through the `MasteryStore` adapter inside one
`ShardWriter.run` transaction (event insert and state cache move together or
not at all); the store's arithmetic is the Rust core only. Evidence emission
(`app/mastery/emission.py`) runs as a worker step after indexing, idempotent
per submission: `answer_match` via `platform_core.compare.answers_in_text`
(contiguous-run containment of each stored final answer's numbers in the
transcription; essay answers or a numberless reading emit nothing; confidence
is the answer-holding region's, else overall), and `working_assessment` via
the `WorkingAssessor` vision seam (`app/mastery/model.py`,
`prompts/working-assessment/v1`, figures as images, rubric/3 with confidence =
overall x model; unmapped concepts dropped). The professor grade
(`POST .../submissions/{id}/grade`, score in [0,1]) emits professor_grade
per mapped concept and triggers the store's supersession replay in the same
transaction. The seat surfaces (`GET .../mastery` with per-concept trails
from `evidence_trail_json`, `GET .../revisit` targeting spec section 5
exactly) are seat-only; the professor reads
`GET .../mastery/distribution` (label counts, no ranking, `gaps` the
defence-named misconceptions verbatim, counted across closed conversations'
validated rubrics, most frequent first and at most five per concept, which
Phase 7 finally fills). Parameter versions live in the directory's
`mastery_params` table;
`scripts/migrate_mastery_params.py` activates a version and bulk-replays
every shard (milestone 6.3).

The parameter spec (milestone 5.1, decision 0036): guide 6.1's typed spec
(number, integer, choice, entity parameters; plain-language invariants passed
verbatim into generation and verification prompts; a free-text solution method)
as pydantic models in `app/params/schema.py`, extended with a per-parameter
`base` value (the value in the base text, which the frozen check and base
rendering need) and an optional entity `description`. Parameter names are clean
identifier tokens. The editor surface is `GET`/`PUT`/`DELETE`
`.../case-studies/{id}/param-spec`, professor-and-owner, the spec compressed
into `case_studies.param_spec_z`. Saving runs the figure-frozen check
(`app/params/figure_check.py`): each essential figure of the case study (via
its confirmed item's `item_figures`; decorative figures excluded, which is one
of the two escape hatches) has its displayed values read once ever through the
`FigureReader` vision seam (`app/params/model.py`, Anthropic live under
`prompts/figure-reading/v1`, recorded in tests), cached by content hash in
`figure_readings` (migration course/0013); a parameter whose base value appears
among a figure's displayed values is refused with a 409 whose `blocked`
extension states each conflict's professor-facing reason (`app/problems.py` now
merges dict-detail extension members into the problem body). Matching is
literal and in Python (authoring-time string matching, not the mandated-Rust
numeric comparer): parsed numeric tokens within relative tolerance,
case-insensitive containment for choice and entity.

Auto-parameterization (milestone 5.2, decision 0037): `POST
.../case-studies/{id}/auto-parameterize`, professor-and-owner, one inline
`SpecProposer` text call (`app/params/proposal.py`, Anthropic live under
`prompts/auto-parameterize/v1`, recorded in tests) reading the confirmed
question and solution (the confirmed item's, never a staged one) as delimited
untrusted content plus the frozen display values from the 0036 cache. The model
returns parameters with a rationale and the exact `literal` of each value;
token positions are computed server-side by searching the body for the literal
(model offsets are never trusted; an absent literal gets an empty list). The
frozen check runs again on the output, so conflicts reach the professor as
`frozen` entries with reasons, excluded from the draft `spec`. The full
response payload is stored compressed in `spec_proposals` (migration
course/0014) with provenance; an Idempotency-Key retry replays it exactly. The
proposal is never the spec: the professor saves through the 5.1 PUT, and that
save scores the latest unsaved proposal (kept/changed/dropped/added parameters,
invariants edit distance) as the guide 6.2 prompt-quality signal.

Generation and verification (milestone 5.3, decision 0038): the loop runs in
the worker (`app/variants/pipeline.py`, job `generate_variant`), never in a
request handler. Seeded sampling (`app/variants/sampling.py`) is a pure
function of (spec, seed), sorted-name order, entity parameters sampling to
None (the generator invents from the description). One text call generates
body plus worked solution plus structured `final_answers` (seam
`VariantGenerator`, `prompts/variant-generation/v1`); two deterministic
fidelity checks run before the verify call is spent (fig:// token multiset
equals the base's; final answers exist); then the independent re-solve
(`VariantVerifier`, `prompts/variant-verification/v1`) sees the variant's
question only with the essential figures attached as images, never the first
pass's output. Agreement is decided by `platform_core.compare` (the Rust
member: tolerant numeric comparer, 0.5% relative tolerance, conservative
toward flagging; it doubles as Phase 6's answer_match). Everything stores with
full provenance (seed, seed values, both prompt versions, both model ids, the
re-solve's solution, the flag reason; migration course/0015, unique
`(case_study_id, seed)`). A flagged variant is never served. The surface:
`POST .../case-studies/{id}/variants` enqueues seeded jobs (seeds derived from
the Idempotency-Key, so retries collapse; 409 without a spec), `GET` lists by
state (?state=flagged is the review queue), `GET /courses/{id}/variants/{id}`
serves the flagged diff (both solutions), promote flips flagged to `manual`,
an edit always lands on `manual`, discard refuses (409) when submissions
reference it. All professor-and-owner; students meet variants only through
the 5.4 pool.

The variant pool (milestone 5.4, decision 0039): publish enqueues
`fill_variant_pool` when the case study has a spec, one sequential worker job
per case study (the arq job id collapses repeats), which is the generation
concurrency cap made structural. The fill (`app/variants/pool.py`) tops up
only the shortfall to `TIRO_VARIANT_POOL_TARGET` (default 20), bounds flagged
attempts at 3x target, and stops when the rolling-30-day per-course token
budget (`TIRO_GENERATION_TOKEN_BUDGET`) is spent; the pipeline writes one
`token_usage` row per model call (migration course/0016, provider usage block,
zero in recorded replays). The practice read
(`GET .../case-studies/{id}/practice-variant?exclude=`, course reader,
published-only for seats) serves a random servable variant (verified or
manual, never flagged), body and id only, never a solution; a dry pool serves
the base case study instantly with a null id (never a wait, the pool
invariant) and enqueues a background top-up.

The voice defence (Phase 7, decisions 0043 and 0044) is a modular pipeline,
not a speech-to-speech model and not a vendor voice-agent orchestrator:
streaming recognition, then Claude, then streaming synthesis, with turn-taking
server-side so behaviour is identical across devices. Context assembly
(`app/defense/context.py`) builds each session from exactly three sources as
delimited untrusted content (the variant, the professor's reference solution,
the student's transcription) plus the mapped concepts by id and the essential
figures attached as images; the persona is the versioned `defense-tutor/v1`
prompt, and nothing about the student beyond seat context is in it. The engine
(`app/defense/engine.py`) is transport agnostic and holds the conversation in
memory: the recognizer's endpoint flag closes a student turn, reply text streams
into synthesis chunk by chunk, fresh speech or a typed turn cancels a reply in
flight, and the session winds down two turns before its twelve-turn cap.
Degradation is structural rather than a second code path: no synthesizer means
captions, no recognizer means a typed session, and a provider that dies
mid-session degrades into exactly those and says so once (`speech_down`,
`audio_down`) while keeping the reply whose audio died as text, because the
next turn must be reasoned from the whole conversation. Speech providers sit
behind two Protocols (`app/defense/speech.py`, adapters in
`speech_providers.py`, chosen by `TIRO_STT_PROVIDER` and `TIRO_TTS_PROVIDER`,
absent by default); the seams exist so a provider swap never touches the
engine. The surface is `POST /api/v1/submissions/{id}/conversation` (seat-only,
own processed submission, a per-course concurrency cap answering an honest 409)
and a WebSocket at `/api/v1/conversations/{id}/stream` authenticated by the
seat's opaque token as a query parameter, since a browser cannot set headers on
a WebSocket. Closing (`app/defense/close.py`) runs the rubric call on the
pinned model, validates it against the mastery spec's schema, retries once, and
never ingests a verdict that does not validate; a valid one becomes one
`defense_rubric` event per discussed-and-mapped concept inside the same writer
transaction that stores the compressed transcript. Raw audio is never
persisted: `conversations` holds text and the verdict only (migration
course/0018), and speech spend lands in `speech_usage` in the provider's own
unit beside the tutor and rubric rows in `token_usage`, because speech
dominates the cost of a defence.

pdfium is single-threaded in a way per-call locking does not cover: the crate
holds one process-wide operation lock across each whole decode or
extract_figures call (two interleaved logical operations corrupt each other's
reads even with pdfium-render's `thread_safe` per-call mutex).

A fixture-backed pdfium test has two preconditions, the native binary and the
LFS-tracked fixture, and skips naming whichever is missing (decision 0046):
`platform_core::pdf::testkit::ready` in Rust, `app.lfs.any_unfetched` in Python.
A `PdfiumLibraryInternalError(FormatError)` is an unfetched LFS pointer reaching
pdfium, not a decode bug. The pdfium version pin lives in
`infra/provision-pdfium.sh` only; `infra/setup.sh` and CI both call it, and CI
checks out with `lfs: true`, which is what makes those gates real rather than
vacuously skipped.

Figure and source-page serving (decision 0032): a figure's bbox is stored
normalised to 0..1 of its page (top-left origin, one frame across born-digital
points and page_crop pixels, `normalized_bbox` in `app/imports/figures.py`), so
a client places a figure or draws a new box with no page-dimension plumbing. The
confirmation read returns per-item `figures[]` (with a presigned `image_url` crop,
its `fig://{id}` token, role, source, dims, page, normalised bbox, caption) and
per-job `pages[]` (with a presigned page `image_url`); `from-box` returns the new
crop's `image_url` and dims. `GET /courses/{id}/figures/{figure_id}` resolves one
figure to a presigned URL for both the confirmation surface and the reading
surface's `fig://` resolver (decision 0014): a professor-owner resolves any figure
in the course, a seat only one a published case study carries (figure to
item_figures to confirmed item to published case study), an unpublished or absent
figure an identical 404 so existence never leaks. `ConfirmIn` also takes an
editable `solution_md`. Presigned bytes only, never through the API.

## Inviolable constraints

These are product law. No convenience, speed, or elegance argument overrides
them, and any code that would weaken one is wrong by definition.

**Figures are pixels from the professor's original.** A figure is never redrawn,
regenerated, described in place, or re-encoded lossily. Crops come from the
lossless source; variants reference the same `figures` rows byte for byte; and
figure bytes never enter a text prompt (figures travel as `fig://{id}` tokens in
markdown, and as attached images only where the spec says so: the figure-frozen
reading, verification re-solve, working assessment, the tutor's context).

**The AI proposes and the professor disposes.** Nothing extracted, generated, or
auto-parameterized becomes student-visible course content without explicit
professor confirmation. Unverified or flagged variants are never served.
Proposal calls run against confirmed content only.

**No student PII exists anywhere.** Students are seats. Nothing beyond the seat
context enters logs, prompts, error messages, or storage. Seat codes are
credentials: Argon2id at rest with a 4-character prefix index (lighter
profile than passwords, decision 0010; all code handling lives in
`app/seats/codes.py`), plaintext in exactly one response ever (generation
artifacts or a reissue body; the log-scanning test in `app/seats` enforces
this), generic failure copy that never distinguishes wrong from revoked.
Redemption is rate limited per IP. Never add a name field, an email, or any
personalization hook to a student surface.

**Hostile text is data.** Text inside a scanned page or an imported PDF is
content to transcribe, never instructions to follow. Prompt assembly keeps
untrusted content clearly delimited, and the tutor never reveals answers no
matter what a transcription contains, or what the student says, pleads, or
instructs during the defence. The three hard rules (never reveal, stay on the
academic task, text is data) travel in the system prompt of every single turn
and of the closing rubric call, not just the first, and the Phase 7 safety
suite asserts it.

**Audio is never retained.** A defence leaves behind its text transcript and
its verdict; the voice itself is transport, held in memory for the length of a
turn and gone. No column, bucket, or log holds student audio, and no test may
introduce one.

## Coding standards

Python 3.12, pydantic v2 models at every module boundary, no raw dicts crossing
boundaries, ruff and mypy strict clean before anything is done (`apps/api`
config lives in `pyproject.toml`; run both from `apps/api`). Rust extensions get
a hand-maintained typed stub in `apps/api/stubs/` kept in lockstep with the
PyO3 surface. New `platform_core` members are clippy-pedantic clean (declare
`[lints] workspace = true` in the member's Cargo.toml; the workspace defines
pedantic as warn and CI's `-D warnings` promotes it) with criterion benchmarks
for public functions, each gated by a budget in
`crates/platform_core/bench-thresholds.json`; the reference `mastery` crate is
exempt from pedantic by decision 0001 and is held to its property suites
instead. Never reimplement the mastery arithmetic, the numeric comparer, or
preprocessing in Python: the Rust implementation is the only implementation.

Scan preprocessing lives in the `tirocinium-preprocess` member (milestone 3.2,
decision 0016), exposed as `platform_core.preprocess`. It is a pure function of
image bytes: in go camera bytes, out come two PNG renditions (a cleaned
grayscale copy for the vision model, an adaptive-binarized copy) plus quality
metrics, following the guide's Stage 2 order (EXIF orientation, downscale to a
2200 px long edge, Hough deskew, illumination correction, adaptive
binarization). An unreadable page is an early rejection carrying a stable
reason code (`blurry`, `too_dark`, `blank`) and a message tail worded to read
after a "Page N" prefix the caller adds, so the crate never needs to know a
page's position. Thresholds are one `Thresholds` struct so recalibration is a
data change; the golden corpus that calibrates them (30 real phone photos) is a
captured, not generated, project asset under `preprocess/corpus/` and is
tracked but not yet populated.

## API conventions

REST over JSON versioned under `/api/v1`: plural nouns, cursor pagination
(`?cursor=`, `?limit=`), RFC 7807 problem details for errors (raise
HTTPException; `app/problems.py` renders it, and routes annotate error
responses with the Problem model), idempotency keys on every mutating
endpoint the frontend can retry. Professors use short-lived JWTs (8 h HS256,
`app/auth/tokens.py`, decision 0009), seats use opaque revocable
course-scoped tokens, and every authorization check lives in the one
dependency layer (`app/auth/deps.py`: `current_identity`,
`require_professor`, `require_admin`): a seat reads only its own submissions
and course, with dedicated tests asserting that. Auth failure copy is
generic and identical across causes, in body and in timing.

Course-scoped resources nest under the course, not flat as section 7's
representative surface shows: per-shard integer ids collide across courses, so
`/api/v1/courses/{course_id}/case-studies/{id}` (and `/concepts`, and the
`/case-studies/{id}/concepts` mappings sub-resource) is the shape, decided and
the guide conflict flagged in decision 0013. Two authorization helpers in
`app/courses/routes.py` serve every course surface: `ensure_course_owner`
(professor authoring, admins pass, 404 then 403) and `ensure_course_reader`
(professor sees drafts, a seat scoped to the course sees published only, so a
draft is a 404 to a student). Case study markdown bodies are compressed through
`app/compression.py` (the `problem_text` dictionary) at rest; plaintext lives
only in transit. Publish is the `draft`/`published` flip only until the variant
pool lands in Phase 5. Deleting a course is refused (409) while seats exist;
deleting a case study with variants is refused (409) the same way.

Idempotency has a concrete home from milestone 3.1 (decision 0015): retryable
mutating calls take an `Idempotency-Key` header and record `(key, scope) ->
row` in the shard's `idempotency_keys` table, so a retry returns the original
row rather than duplicating it; naturally idempotent state transitions
(a pending-to-uploaded flip) need no ledger. Uploads go direct to object
storage via presigned URLs with server-chosen keys under a per-submission
prefix (scans bucket, `app/storage.py`); the API never receives the bytes,
limits are enforced on the declared manifest (backend guide section 4 Stage 1),
and a seat reads only its own submissions (another seat's row is a 404).

Heavy work runs off the request path in an arq worker (`app/worker.py`,
milestone 3.3, decision 0018), never inside a request handler. The API only
hands work over through two Redis-backed seams, both optional so dev and tests
run with no broker: an enqueue queue (`app/tasks.py`, `get_task_queue`, a no-op
fallback) and a progress bus (`app/events.py`, `get_event_bus`, an in-process
fallback). `complete` enqueues `process_submission` only on the actual
pending-to-uploaded flip (a re-complete enqueues nothing). Progress is SSE at
`GET /api/v1/submissions/{id}/events` over the channel
`submission:{course_id}:{submission_id}`, emitting the current status then
forwarding `page`/`rejected` events until a terminal `done`. The submission
status vocabulary the pipeline drives is `uploaded` -> `processing` ->
`processed` | `needs_retake` (a page failed preprocessing) | `failed`.
Transcriptions are cached in `page_transcriptions` (migration course/0005) keyed
by the server-computed sha256 of the fetched original bytes, never the
client-declared hash, so retries are free and the cache is not client-poisonable.
That server hash is also stored on `submission_pages.content_sha` (migration
course/0008, decision 0023) so the review read can join a page to its reading:
`GET /submissions/{id}/transcription` serves the aggregate markdown and per-page
readings with region boxes, a seat surface (own submission only). It is the
student's own handwriting, never a solution, so returning it reveals no answer.

Indexing (milestone 3.4, decision 0020) is Stage 4, a step the worker runs after
the pipeline, not inside it: `index_submission` (`app/retrieval/indexing.py`)
puts recognized text into `search_fts` and stores an int8-quantized embedding of
it, and is idempotent so a job retry re-indexes cleanly. Retrieval is
`GET /api/v1/courses/{id}/search?q=`, nested under the course and gated through
`ensure_course_owner` (searching is a professor-and-owner surface; students
never search), fusing FTS5 BM25 and int8 cosine similarity with reciprocal rank
fusion (`app/retrieval/search.py`, `k=60`). A free-text query is turned into a
safe FTS5 MATCH (quoted OR-ed word tokens), never trusted as operator syntax.
Only submissions are indexed for now; variant and problem-text indexing arrive
with the Phase 5 variant pool.

PDF import (Phase 4, milestone 4.1, decision 0021) reuses the upload handshake:
`POST /api/v1/courses/{id}/imports` returns a presigned PDF PUT (60 MiB ceiling
on the manifest), `.../complete` flips pending to uploaded and enqueues decode,
`.../imports/{id}` reports status. Imports nest under the course and are
professor-and-owner (students never import), create is idempotent through
`import_idempotency_keys`. The decode worker (`app/imports/pipeline.py`) turns
each page into cached per-page markdown (`page_documents`, keyed by the
server-computed hash of the rendered raster): born-digital text from the decoder,
scanned pages through the 3.2 preprocess and the 3.3 vision seam under the
`pdf-page-transcription` prompt, which never describes a figure. Decode runs
behind a `PdfDecoder` seam (`app/imports/decoder.py`); `FakePdfDecoder` drives
the pipeline tests, and the real `PdfiumDecoder` (decision 0024) calls the
`tirocinium-pdf` member (`platform_core.pdf.decode`) on `pdfium-render`. pdfium
is a native library loaded at runtime from a vendored, pinned binary that
`infra/setup.sh` provisions (`TIRO_PDFIUM_LIB` overrides); it binds once per
process (re-init aborts). Decode is deterministic CPU work, so it is exercised
with real calls, not recorded responses (that rule is for models), and its tests
skip when the binary is absent. The member is exempt from the bench-budget gate
(native-render-bound), like mastery is from pedantic. The 200-page ceiling is
enforced at decode (the count is unknown until pdfium opens the file).

Figure extraction (milestone 4.2, decision 0025) is the deterministic detector:
`platform_core.pdf.extract_figures` keeps an embedded JPEG stream byte for byte
and renders clustered vector drawings at 300 dpi, behind a `FigureExtractor`
seam (real calls in tests, skip-gated on the binary). The pipeline runs it on
born-digital pages, storing figure bytes content-addressed in the imports bucket
(`imports/{course}/figures/{sha256}.{ext}`, deduped by `figures.content_hash`,
migration course/0009), metadata only in the shard, and placing
`![caption](fig://{id})` in the page markdown. Figure bytes never enter a text
prompt: only the token travels with the text (a pipeline test asserts it). This
is the figures-are-pixels constraint made mechanical: never a lossy re-encode of
a raster, never a redrawn diagram. `item_figures` links land in 4.3; scanned-page
figures (`page_crop`) via the vision detector (decision 0028): a `FigureDetector`
seam proposes boxes on a scanned page, each cropped from the raster by
`platform_core.pdf.crop_figures` (pure image, no pdfium, never a re-render) into
a `page_crop` figure stored and tokenised like the rest. Born-digital pages carry
deterministic figures, scanned pages carry page crops, disjoint by kind. The
detector only locates figures, never describes or redraws one.

Segmentation (milestone 4.3, decision 0027) is the second Stage-2 pass: a
`Segmenter` seam (`app/imports/segmentation.py`, Anthropic in prod,
`RecordedSegmenter` in tests, `prompts/segmentation/v1`) reads a job's assembled
page markdowns (page markers plus fig:// tokens, never figure bytes) and returns
items, which stage in `import_items` with `item_figures` (migration course/0010)
as `pending`: the AI proposes, the professor disposes, so nothing is
student-visible until confirmed in 4.4. A model-named figure id is linked only
when it exists (a hallucination is dropped); provenance (`model_id`,
`prompt_version`) and the model's `title`/`notes` are stored on the item. The
pipeline runs segmentation last, and a 30-day purge (`app/imports/purge.py`)
removes unconfirmed jobs and their staging plus orphaned old figures.

Confirmation (milestone 4.4 backend, decision 0029) is the professor's explicit
act: `POST /api/v1/courses/{id}/import-items/{item_id}/confirm` copies a staged
item's question into `case_studies` as a draft (fig:// tokens intact), marks the
item `confirmed` and links it (`case_study_id`, migration course/0011), and flips
the job to `confirmed` so the purge spares the item and its figures. Idempotent,
professor-and-owner; `GET .../imports/{id}/items` lists the staged items. Nothing
copies automatically (the AI proposes, the professor disposes); the confirmed
item is kept because it holds the solution Phase 5 needs, and only the draft is
student-facing. Confirm also takes the professor's edited text and a figure-
intervention count and logs the two extraction-accuracy metrics (4.5, decision
0030): the Levenshtein `text_edit_distance` from the extraction and the
interventions, in `import_item_metrics`, for the Phase 8 dashboards. Edit distance
is plain Python (off the hot path; the mandated-Rust code is the numeric comparer
and mastery arithmetic, not this). Three figure verbs are built (decision 0031)
on `item_figures`/`figures`: `PUT .../import-items/{item}/figures/{figure}`
assigns and sets role (`decorative` excludes a figure from AI context), reassign
is that PUT plus `DELETE`, and `POST .../figures/from-box` crops the page raster
at a drawn box (`crop_figures`, a page_crop, never a re-render). Re-crop and split
need per-kind re-cropping from the lossless source (page raster, PDF re-render, or
the embedded image) and are deferred to the corpus.

After any route or model change, regenerate the contract seam and commit both
artifacts (decision 0003): `python scripts/export_openapi.py` in `apps/api`,
then `pnpm generate:client` in `apps/web`. CI fails on a stale byte anywhere.

## Data layer rules

Every SQLite connection goes through `app.db.connection.connect` (the pragma
helper of backend guide 3.2); a bare `sqlite3.connect` outside `app/db` is a
defect. One dedicated writer connection per shard behind `ShardWriter.run`,
which owns the transaction: the function you pass it must never use BEGIN,
COMMIT, ROLLBACK, or `executescript` (executescript commits implicitly and
breaks the queue's transaction; the writer raises on this misuse). Reads go
through the shard's `ReadPool`. One database file per
course, `directory.db` for cross-course lookups, and never a cross-shard join in
SQL. Images, scans, and figure bytes live in object storage, never in SQLite.
Timestamps are integer Unix epoch. Schema changes are numbered migrations
applied per shard at startup; nobody edits a shard by hand. Shards are
continuously replicated by Litestream: never run
`PRAGMA wal_checkpoint(TRUNCATE)` on a live shard (it breaks the shadow WAL,
decision 0008); `VACUUM INTO` via `app.db.backup.snapshot_shard` is the
sanctioned maintenance path, and the restore drill
(`infra/restore-drill.sh`) must stay green. Blob columns are
zstd-compressed through `app/compression.py` (dictionaries per content type,
stored in the shard, arithmetic in `platform_core.codec`); Python never
touches raw zstd and `zstandard` must not reappear in the dependency set.

## Frontend conventions

Scaffolded per decision 0005; specified by the frontend guide. Server
Components by default: every client component justifies itself in its PR
description, every new dependency states its bundle cost, and content routes
stay under 170 kB gzipped initial JS. Route groups are `(student)`,
`(professor)`, `(marketing)`; shared primitives live in `components/ui` on
Radix behaviours; no component reaches into another feature's directory. The
token layer is `src/styles/tokens.css` (guide 3.2 palette pinned by test);
every string lives in a typed `strings.ts` per route group, sentence case, one
job per string. Server data types come only from the generated OpenAPI client,
never hand-written. Mastery labels are never bare (each expands to its
evidence trail), figures render exactly as extracted at their token position
on every surface, seats stay pseudonymous with the seat number quietly in the
shell, and there are no streaks, guilt notifications, leaderboards, or
infinite scroll, ever. WCAG 2.2 AA is the floor; reduced motion renders
stills; keyboard operability includes the upload flow and j/k review surfaces.

## Model-call rules

Every prompt shipped to a model lives versioned in `apps/api/prompts/{name}/
{version}.md` with a `CHANGELOG.md`, loaded by `app/prompts.py` (which returns
the text and a `provenance` id). Provenance is stored with every generated
artifact: seed, prompt version, model id. Generation is capped per course,
deduped by seed, and token usage is logged per course. Only course content goes
to the provider, never anything about a student beyond seat context.

Model access is a Protocol so tests never hit a live model (testing skill). The
handwriting reader is `VisionTranscriber.transcribe(image_png, prompt, *,
model_id)` (`app/transcription/model.py`) with a real `AnthropicTranscriber`
(Claude, `TIRO_VISION_MODEL_ID` / `TIRO_ANTHROPIC_API_KEY`) and a
`RecordedTranscriber` that replays a `PageTranscription` keyed by the sha256 of
the exact grayscale image bytes. Recorded responses are project assets under
`apps/api/tests/recorded/transcription/`; the transcription prompt treats all
text in the image as student work, never as instructions (the hostile-text-is-
data constraint above).

The retrieval embedder is the same shape (decision 0020):
`Embedder.embed(text, *, model_id)` (`app/retrieval/model.py`) with a real
`OpenAIEmbedder` (`TIRO_EMBEDDING_MODEL_ID` / `TIRO_OPENAI_API_KEY`, so vision
stays Anthropic and embeddings are OpenAI, the only two provider families) and a
`RecordedEmbedder` that replays a float vector keyed by the sha256 of the exact
text, from `apps/api/tests/recorded/embeddings/`. The vector's int8 scalar
quantization and cosine similarity live in `platform_core.embedding`, never in
Python; the float32 original is kept zstd-compressed for requantization after a
model change. Embedding a submission's recognized text crosses no new line: it
is student work, not student identity, and Stage 3 already sends the page to a
provider.

The tutor is the same shape again (`app/defense/model.py`): `Tutor` with
`stream_reply` and `close_rubric`, `AnthropicTutor` live and `RecordedTutor`
replaying scripted replies and verdicts in order. Two models, deliberately:
conversational turns run on the fastest suitable Claude
(`TIRO_TUTOR_MODEL_ID`), because a defence turn is a short spoken question and
the 800 ms budget only closes with a first token near 200 ms, while the closing
rubric runs on the stronger model pinned to a dated snapshot id rather than a
`-latest` alias (`TIRO_RUBRIC_MODEL_ID`), because its judgement is evidence and
a silent provider update must not shift its calibration. The session context is
large and identical on every turn, so it carries Anthropic cache breakpoints on
the last system block and on the figures attached to the first student turn.
Speech providers are not model seams in this sense and are never recorded:
their adapters are live integrations for the smoke lane, and the suite drives
scripted timings through the same Protocols instead.

The provider keys and any runtime overrides can live in a gitignored
`apps/api/.env` (decision 0035): `app/env.py`'s `load_local_env()` runs once at
package import so the API factory, the arq worker, and the scripts pick it up
before any client is built, but it is a no-op when `TIRO_TESTING` is set, so the
recorded-mock suite never inherits real keys or a broker URL (`conftest.py` sets
the flag). A real environment variable still overrides the file (`override=False`),
so shells and deployments are unaffected. `.env.example` documents the names;
never commit `.env`, and keys stay credentials.

## When the guides are silent

Decide, implement, and record the decision in one paragraph in
`docs/decisions/` with the next number. When guides conflict with anything
else, the guides win and the conflict is flagged out loud.
