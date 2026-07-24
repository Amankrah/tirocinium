---
name: tirocinium-conventions
description: Tirocinium coding standards, API conventions, data-layer rules, and the inviolable product constraints. Use in every backend session before writing or reviewing code, and whenever a design choice touches figures, student identity, shards, or AI-generated content.
---

# Tirocinium conventions

The four documents in `docs/` are the specification and outrank this skill; this
skill is the operational digest that survives context windows. Last updated for
Phase 4.1 (data layer, auth, seats, and the authoring backend done; the
handwritten solution upload path live; scan preprocessing implemented in Rust;
handwriting transcription running in an off-request-path worker with a recorded-
response model seam and SSE progress; indexing and retrieval done, with FTS5 and
int8-quantized embeddings behind a provider seam and hybrid retrieval over them.
The Phase 3 backend is complete; 3.5 and the end-to-end gate are the frontend's.
Phase 4 has begun: 4.1 decode is complete, the PDF import handshake, the decode
worker, and the real `tirocinium-pdf` member binding pdfium over a vendored
native binary).

## Inviolable constraints

These are product law. No convenience, speed, or elegance argument overrides
them, and any code that would weaken one is wrong by definition.

**Figures are pixels from the professor's original.** A figure is never redrawn,
regenerated, described in place, or re-encoded lossily. Crops come from the
lossless source; variants reference the same `figures` rows byte for byte; and
figure bytes never enter a text prompt (figures travel as `fig://{id}` tokens in
markdown, and as attached images only where the spec says so: verification
re-solve, working assessment, the tutor's context).

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
enforced at decode (the count is unknown until pdfium opens the file). 4.1 stops
at decoded page markdown; figures (4.2) and item segmentation (4.3) build on
these rows.

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

## When the guides are silent

Decide, implement, and record the decision in one paragraph in
`docs/decisions/` with the next number. When guides conflict with anything
else, the guides win and the conflict is flagged out loud.
