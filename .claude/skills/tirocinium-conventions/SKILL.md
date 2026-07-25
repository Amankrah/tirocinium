---
name: tirocinium-conventions
description: Tirocinium coding standards, API conventions, data-layer rules, and the inviolable product constraints. Use in every backend session before writing or reviewing code, and whenever a design choice touches figures, student identity, shards, or AI-generated content.
---

# Tirocinium conventions

The four documents in `docs/` are the specification and outrank this skill; this
skill is the operational digest that survives context windows. Last updated for
Phase 5.1 (data layer, auth, seats, and the authoring backend done; the
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
frontend's.

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

pdfium is single-threaded in a way per-call locking does not cover: the crate
holds one process-wide operation lock across each whole decode or
extract_figures call (two interleaved logical operations corrupt each other's
reads even with pdfium-render's `thread_safe` per-call mutex).

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
matter what a transcription contains.

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
