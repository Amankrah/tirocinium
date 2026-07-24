---
name: tirocinium-testing
description: How to run every Tirocinium test suite, what each phase gate requires, and where the golden fixtures live. Use in every backend session before starting a milestone and before declaring any work done.
---

# Tirocinium testing

A milestone is done only when its gate is green and every earlier gate still
passes; green never goes red. Last updated at milestone 4.1 (decisions 0021,
0024):
Phase 0 and Phase 1 complete, Phase 2 backend (2.1) done, Phase 3 backend
complete (3.1 the submission upload path done; 3.2 scan preprocessing
implemented, its golden gate awaiting the 30-photo corpus; 3.3 handwriting
transcription done, the worker pipeline with a recorded-response model seam and
SSE progress; 3.4 indexing and retrieval done, FTS5 plus int8-quantized
embeddings behind a provider seam, hybrid retrieval with reciprocal rank
fusion, the course search endpoint). Phase 4 in progress: 4.1 (decode) complete
end to end, the PDF import upload handshake and the decode worker (born-digital
and scanned pages to cached per-page markdown), and the real `tirocinium-pdf`
member binding pdfium over a vendored native binary. The Phase 3 frontend half
(3.5) is in
progress: the upload flow (capture, pre-checks, orchestration, SSE processing)
is built end to end (capture, pre-checks, orchestration, SSE processing, and the
transcription preview against the Stage 5 endpoint) with its journeys written and
skip-gated; only the not-yet-wired end-to-end Playwright/Lighthouse/axe CI gate
remains the frontend's to close, and that is a joint `ci.yml` edit.

## Running the suites

All paths from the repo root. On Windows the venv binaries are under
`.venv/Scripts/`; on Linux and macOS (and CI) they are under `.venv/bin/`.

The full bootstrap and gate in one command (provisions everything, then runs
imports, lint, and both suites; see `infra/README.md` for flags):

    ./infra/setup.sh

Rust workspace, 45 tests (mastery 15: 6 property, 9 scenario; codec 8;
preprocess 8: 7 synthetic-image pipeline tests, 1 golden-corpus harness that is
a no-op until the corpus lands; embedding 10: 7 scenario, 3 property; pdf 4:
3 decode tests that skip when the pdfium binary is absent, 1 no-op golden-corpus
harness) plus lint:

    cd crates/platform_core
    cargo test --workspace
    cargo fmt --all -- --check
    cargo clippy --all-targets -- -D warnings
    cargo clippy -p tirocinium-mastery --features python -- -D warnings
    cargo clippy -p tirocinium-embedding --features python -- -D warnings
    cargo clippy -p tirocinium-pdf --features python -- -D warnings

Criterion benches with the absolute-budget regression gate (decision 0004;
budgets live in `crates/platform_core/bench-thresholds.json`, revised only
deliberately and with the reference means in the file updated to match). The
preprocessing bench `preprocess_page_a4` is the exception to the 25-30x rule:
it is budgeted at the guide's hard 2 s-per-page SLO (reference mean 408 ms), so
it gates the product budget directly:

    cd crates/platform_core
    cargo bench --workspace
    python ../../infra/check-bench-thresholds.py

Python suite, 141 tests (25 data layer, 16 case studies/concepts/courses,
15 seats, 12 auth, 16 submissions (incl. 4 transcription-read), 5 transcription,
14 retrieval (4 indexing, 4 hybrid-search, 6 search endpoint), 15 imports
(4 decode pipeline, 9 endpoint, 2 pdfium decoder that skip when the binary is
absent), 7 backup, 5 compression, 3 contract, 7 store, 1 latency gate) plus lint
and the worker import smoke, from `apps/api`:

    cd apps/api
    .venv/Scripts/python -m pytest -q
    .venv/Scripts/ruff check .
    .venv/Scripts/mypy .
    .venv/Scripts/python -c "import app.worker"

The suite imports the built extension; if `platform_core` is missing (a plain
`uv sync` also prunes it), rebuild the single wheel (decision 0006) into the
venv:

    cd apps/api
    VIRTUAL_ENV="$PWD/.venv" .venv/Scripts/maturin develop --release --manifest-path ../../crates/platform_core/python/Cargo.toml

Web suite (132 Vitest tests: the token contract with its computed-contrast
assertion, the primitives, the API clients, and the upload flow's pre-checks,
orchestration controller, SSE processing model, and transcription preview), plus
lint, typecheck, and
build, from `apps/web` (typecheck needs a build first on a fresh checkout,
decision 0005). The Playwright journeys run separately (`pnpm test:e2e`, needs
`playwright install chromium` once); journeys one to three are skip-gated on a
seeded backend:

    cd apps/web
    pnpm test
    pnpm lint
    pnpm build
    pnpm typecheck

Contract seam regeneration after any route or model change (CI diffs both
committed artifacts; `test_committed_spec_is_fresh` enforces the spec half in
every pytest run):

    cd apps/api && .venv/Scripts/python scripts/export_openapi.py
    cd apps/web && pnpm generate:client

Dev services (MinIO on :9000/:9001, Redis on :6379). On this Windows host start
Docker Desktop first if `docker info` fails:

    docker compose -f infra/docker-compose.yml up -d --wait

The restore drill (Phase 1 gate; needs MinIO, starts it itself if docker is
available; runs containerized on hosts without a native litestream binary):

    ./infra/restore-drill.sh

## The gate table

Phase 0 (current), all green as of 0.4:

- 0.1: crate 15 tests and store 7 tests pass inside the monorepo layout; clippy
  clean on both feature sets.
- 0.2: `infra/setup.sh` from clean succeeds end to end, including its own
  verification gate (21 import checks, ruff, mypy strict, both suites, and the
  transcription worker import smoke).
- 0.3: the committed `openapi.json` and generated client are byte-fresh; a
  deliberately stale artifact fails CI's `contract` job (proven both
  directions before commit).
- 0.5: eight criterion benches cover the crate's public functions and pass
  their absolute budgets; the checker fails on over-budget, missing, or
  unbudgeted benches (proven both directions). The web half landed with the
  scaffold (decision 0005): CI's `web` job runs eslint, Vitest, next build,
  and tsc; Lighthouse and axe join it at the Phase 2 gate.

Phase 1, in progress:

- 1.1 (done): the pragma helper is the only door to SQLite and its exact
  values are pinned by test; the writer queue serializes and rolls back;
  migrations apply per shard at startup with gap and divergence detection;
  the course 0001 migration is pinned against mastery_store.SCHEMA; the
  mastery store runs green on a managed shard through the writer queue.
- 1.2 (done): the codec crate roundtrips by property, a trained dictionary
  beats plain on corpus text, a wrong dictionary fails loudly; dictionaries
  live per content type in course shards (course/0002); blobs compressed
  before training decompress after it; the zstandard fallback is out of the
  dependency set; everything ships as the single platform_core wheel
  (decision 0006).
- 1.3 (done): the restore drill passes (point-in-time restore by WAL index
  and latest restore both digest-verified, snapshot round trip through
  object storage stable; decision 0008) and runs in CI's `restore-drill`
  job; 7 backup tests cover the digest, VACUUM INTO, and the upload seam.
  Never run `PRAGMA wal_checkpoint(TRUNCATE)` on a replicated shard.
- 1.4 (done): professor signup/login/me with Argon2id passwords and 8 h
  HS256 JWTs (decision 0009); 12 auth tests cover generic identical
  failures (body and timing), expired/tampered/seat-role tokens rejected,
  case-insensitive email uniqueness, and the role gates. Errors are RFC
  7807 problem+json via app/problems.py from here on.
- 1.5 (done, closing the phase): the full seat lifecycle (decision 0010).
  Gate items all green: seat authorization properties (seat tokens rejected
  on professor surfaces and vice versa, non-owners rejected, each seat sees
  only itself); revoked seats fail immediately including live sessions;
  reissue preserves the seat id and kills old code and sessions; plaintext
  codes in exactly one response ever and never in logs (log-scanning test);
  redemption rate limiting 10/h/IP with exponential backoff; read-path p95
  under 150 ms on the 50-case fixture shard (app/db/fixtures.py builds it;
  the latency gate lives in app/db/test_latency.py).

Phase 2, in progress:

- 2.1 (done, backend half of the slice): course CRUD, case study CRUD with
  markdown bodies compressed through the codec at rest, concept CRUD and
  case-to-concept mappings (mastery spec section 2), and publish states,
  all nested under the course (decision 0013). The 16 tests in
  app/case_studies/test_case_studies.py cover the CRUD round-trips,
  body-compressed-at-rest (the stored blob carries the zstd magic and
  decompresses to the original), cursor pagination, publish transitions,
  a seat reading only published content, concept mappings with weight and
  unknown-concept validation, and the authorization and isolation
  properties (only the owner authors, a seat cannot author, shards stay
  isolated across courses). The full 2.2 to 2.4 gate (Playwright journey
  one, Lighthouse, axe) is the frontend's to close.

Phase 3, in progress:

- 3.1 (done): the handwritten solution upload path (decision 0015). Presigned
  direct-to-storage upload with server-enforced limits (1 to 25 pages, at most
  15 MiB per page, JPEG/PNG/HEIC/PDF), the completed-manifest handshake
  (pending to uploaded), and idempotency on the creating call. The 9 tests in
  app/submissions/test_submissions.py cover the URL issue, the limit
  enforcement, PDF acceptance, the unknown-variant 404, idempotency-key dedupe
  (one row for a repeated key), complete, get, and the seat-only authorization
  property (a seat cannot read or complete another seat's submission; a
  professor JWT is rejected). Migration course/0004 adds submission_pages and
  idempotency_keys. Transcription (3.3) and indexing (3.4) are the rest of the
  Phase 3 gate.
- 3.2 (code done; golden gate pending the corpus): scan preprocessing in the
  `tirocinium-preprocess` member (decision 0016), EXIF fix, downscale, Hough
  deskew, illumination correction, adaptive binarization, quality metrics and
  early rejection with reason codes. The 8 crate tests are green (7 synthetic
  pipeline tests pinning the algorithms with known ground truth: recovered skew
  near the induced angle, blur ordering, each rejection reason, the downscale
  budget, decode failure; plus the golden-corpus harness). `preprocess_page_a4`
  is inside the 2 s SLO (reference mean 408 ms). Not yet closed: the guide's
  30 real phone photos are a captured project asset that does not exist yet, so
  the golden-file suite within perceptual-hash tolerance and the p95-on-the-
  corpus measurement wait on that data; the harness and record mode are ready
  for it.
- 3.3 (done): handwriting transcription (decision 0018). An arq worker runs the
  pipeline off the request path: preprocess each page with the 3.2 crate, store
  the two renditions, read the grayscale copy with the vision model behind a
  recorded-response seam, cache the reading by the server-computed content hash
  (migration course/0005 adds `page_transcriptions` and the per-page processing
  columns), aggregate into `recognized_z` with mean confidence, and publish
  per-page progress. `complete` enqueues the job; `GET /submissions/{id}/events`
  streams SSE over Redis pub/sub. The 5 transcription tests
  (app/transcription/test_pipeline.py) cover the happy path (renditions stored,
  cache populated, aggregate decompresses, status processed, page and done
  events), the content-hash cache (a byte-identical repeat calls no model), a
  page rejection (page rejected, submission needs_retake, rejected event, no
  model call), the in-memory bus delivery, and the recorded-asset loader; the 3
  new submission tests cover complete-enqueues-once, the terminal-status SSE
  snapshot, and SSE seat isolation. Redis is optional for the API process (no-op
  queue and in-process bus without `TIRO_REDIS_URL`), required for the worker.
  Stage 5 review read (decision 0023): `GET /submissions/{id}/transcription`
  serves the aggregate markdown and per-page readings with region boxes; the
  worker stores the server content hash on `submission_pages.content_sha`
  (migration course/0008) so pages join to `page_transcriptions`. The 4 read
  tests cover populated regions, empty-before-processing, seat isolation, and a
  professor rejected.
- 3.4 (done): indexing and retrieval (decision 0020). After the pipeline, the
  worker runs `index_submission` (a separate step, so 3.3 stays untouched):
  recognized text into `search_fts`, embedded through a provider seam (OpenAI in
  prod, `RecordedEmbedder` in tests), quantized to int8 in the new
  `platform_core.embedding` member, stored with the float32 original kept for
  requantization (migration course/0006). Retrieval is
  `GET /api/v1/courses/{id}/search?q=`, professor-and-owner, fusing FTS5 BM25 and
  int8 cosine with reciprocal rank fusion. The 14 Python tests cover indexing
  (populate, idempotent re-index, skip without text, backfill), the hybrid gate
  (an exact term and a word-disjoint paraphrase both surface the seeded
  submission, plus the RRF unit and an empty course), and the endpoint (fused
  hit, 401/404/403, a seat refused, q required); the member adds 10 Rust tests
  and 2 budgeted benches.
- 3.5 (web, in progress): the upload flow (decision 0019). Client pre-checks
  (type/size mirroring the server, a canvas blur heuristic; page-checks pure and
  tested), the server-side submissions client, the orchestration controller
  (create, per-page PUT with retry, complete; side-effects injected and tested),
  the capture-and-drop surface, and the live processing state over the worker's
  SSE stream (a same-origin Next route handler proxies the token from the
  httpOnly cookie; the event model is parsed and reduced by a pure, tested
  module). Page bytes PUT direct to storage; the authed calls proxy through
  server actions so the seat token never reaches client JS. The upload surface
  is reached at `/course/{id}/upload?variant={id}`, seed-gated because exposing a
  variant is Phase 5. Playwright journeys two (happy path, needs the worker) and
  three (client blur reject and retake, needs only a seat) are written and
  skip-gated like journey one; their PNG page fixtures are built in-test. The
  transcription preview is done against the Stage 5 read endpoint (decision 0023):
  on processed it renders the recognized markdown beside the thumbnails with
  low-confidence region spans surfaced, lazy-loaded via next/dynamic so
  react-markdown and KaTeX stay out of the route's initial JS (holds at 112 kB),
  and journey two asserts it. The one thing left in 3.5 is CI enforcement: the
  whole Phase 2 to 3 Playwright/Lighthouse/axe gate is still not wired into the
  `web` job (which runs only lint, test, build, typecheck). Lighthouse is ready
  to land green (decision 0022 made LCP a warning, the other three budgets stay
  blocking and pass); the remaining `ci.yml` edit is a joint one with the backend
  (handoffs in docs/handoffs/).

Phase 4, in progress:

- 4.1 (done): PDF decode (decision 0021). `POST /api/v1/courses/{id}/imports`
  hands back a presigned PDF PUT (60 MiB ceiling), `.../complete` flips and
  enqueues decode, `.../imports/{id}` reports status; imports nest under the
  course and are professor-and-owner. The decode worker (`app/imports/pipeline.py`,
  migration course/0007) turns each page into cached per-page markdown, born
  digital from the decoder's text and scanned via the 3.2 preprocess plus the 3.3
  vision seam under a new `pdf-page-transcription` prompt, keyed in
  `page_documents` by the server-computed hash of the rendered raster. Built
  against a `PdfDecoder` seam (`FakePdfDecoder` in tests). The 13 Python tests
  cover the decode paths (born-digital and scanned, the cache, the 200-page
  ceiling, a missing job) and the endpoints (presigned create, idempotent create,
  oversize reject, complete-enqueues-once, get, and the auth/isolation surface:
  401, non-owner 403, a seat refused, cross-course 404). The real decoder
  (decision 0024) is the `tirocinium-pdf` member on `pdfium-render` over a pinned
  native binary (`chromium/7961`, vendored by `infra/setup.sh` into
  `crates/platform_core/pdf/vendor`, not committed, `TIRO_PDFIUM_LIB` overrides):
  `platform_core.pdf.decode` classifies each page, extracts born-digital text,
  and renders a PNG; `PdfiumDecoder` calls it. pdfium binds once per process
  (re-init aborts) and is exercised with real calls (deterministic CPU, not a
  model), the tests skipping when the binary is absent. The member is exempt from
  the bench-budget gate (native-render-bound). Still open for Phase 4: the
  five-PDF golden corpus (an external asset).

## Standing rules

Model calls in tests are recorded-response mocks, always; live-model smoke
tests run in a separate non-blocking CI lane. The realistic course-shard
fixture (50 case studies, 500 submissions) becomes the shared data-layer
fixture when Phase 1 builds it. Property tests belong in Rust next to the
arithmetic they pin down.

## Golden fixtures

Corpora are project assets in Git LFS (`.gitattributes` already routes pdf,
png, jpg, jpeg, heic, webp there; run `git lfs install` before adding the
first one).

The 30-photo handwriting corpus lives at
`crates/platform_core/preprocess/corpus/` (photos under `images/`, golden
baselines in `expectations.json`, the spec for the set in `README.md`). It is
scaffolded but empty: the golden harness in `preprocess/tests/corpus.rs` is a
self-documenting no-op while `images/` is empty, so the gate stays green
without verifying absent data. Once the photos land, record the baseline with
`TIRO_RECORD=1 cargo test -p tirocinium-preprocess --test corpus` and review
the written `expectations.json` before committing (each entry is either a
rejection reason code or a grayscale-rendition dHash with a Hamming tolerance).

Recorded vision-model responses for handwriting transcription live at
`apps/api/tests/recorded/transcription/`, one JSON file per page named for the
sha256 of the exact grayscale image bytes the model was shown (matching the
`PageTranscription` schema). `RecordedTranscriber` replays them; the set grows
as the transcription corpus does. Versioned prompts live at
`apps/api/prompts/handwriting-transcription/` (a `vN.md` per version plus a
`CHANGELOG.md`), loaded by `app/prompts.py`, and the version string is stored
with every transcription as provenance.

Recorded embedding responses for retrieval live at
`apps/api/tests/recorded/embeddings/`, one JSON file per text (a JSON array of
floats) named for the sha256 of the exact text embedded. `RecordedEmbedder`
replays them; `platform_core.embedding.quantize` turns a vector into the stored
int8 codes. The hybrid-retrieval tests build their embedder in memory from known
texts and hand-authored vectors, so the gate needs no committed asset; the
directory is where a captured corpus lands as one grows.

The five-PDF ingestion corpus lives at `crates/platform_core/pdf/corpus/` (PDFs
under `pdfs/`, the spec in `README.md`); it is scaffolded but empty, so the
harness in `pdf/tests/corpus.rs` is a no-op until it lands. Small fixture PDFs
for the decode unit tests live at `crates/platform_core/pdf/tests/fixtures/`
(committed; generated with fpdf2). The pdfium native binary itself is not a
fixture but a provisioned dependency: `infra/setup.sh` downloads the pinned
`chromium/7961` build into `crates/platform_core/pdf/vendor/` (gitignored), and
the decode tests skip without it.
