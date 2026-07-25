---
name: tirocinium-testing
description: How to run every Tirocinium test suite, what each phase gate requires, and where the golden fixtures live. Use in every backend session before starting a milestone and before declaring any work done.
---

# Tirocinium testing

A milestone is done only when its gate is green and every earlier gate still
passes; green never goes red. Last updated at milestone 5.2 (decision 0037:
auto-parameterization):
Phase 0 and Phase 1 complete, Phase 2 backend (2.1) done, Phase 3 backend
complete (3.1 the submission upload path done; 3.2 scan preprocessing
implemented, its golden gate awaiting the 30-photo corpus; 3.3 handwriting
transcription done, the worker pipeline with a recorded-response model seam and
SSE progress; 3.4 indexing and retrieval done, FTS5 plus int8-quantized
embeddings behind a provider seam, hybrid retrieval with reciprocal rank
fusion, the course search endpoint). Phase 4 in progress: 4.1 (decode) complete
end to end (import upload handshake, decode worker, the real `tirocinium-pdf`
member binding pdfium over a vendored native binary); 4.2 (figure extraction)
the deterministic detector done, embedded rasters pulled byte-identical and
vector drawings rendered at 300 dpi, stored content-addressed with fig:// tokens
placed in the page markdown; 4.3 (segmentation) the fidelity-strict model pass
staging items (question/solution pairs with figure assignments) plus the 30-day
purge, done, and the vision figure detector now closes Stage 1b's two-detector
union (scanned-page page_crop figures cropped from the raster, decision 0028);
4.4's confirm endpoint (backend) copies a staged item into a draft case study
with its figures; 4.5 logs the two extraction-accuracy metrics (text edit
distance and figure interventions per item) at confirmation; three figure verbs
(mark decorative, reassign, add-a-box) are built, with re-crop and split
deferred. The Phase 4 backend is complete bar those two; the confirmation
surface is the frontend's. Phase 5 has begun: 5.1 (the parameter spec, its
editor panel backend, and the figure-frozen check behind the cached
`FigureReader` vision seam) and 5.2 (auto-parameterization behind the
`SpecProposer` seam, with server-computed token positions, pre-professor
frozen filtering, and the save-time edit signal) are done.
The Phase 3 frontend half
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

Rust workspace, 51 tests (mastery 15: 6 property, 9 scenario; codec 8;
preprocess 8: 7 synthetic-image pipeline tests, 1 golden-corpus harness that is
a no-op until the corpus lands; embedding 10: 7 scenario, 3 property; pdf 10:
3 decode and 6 figure tests (5 skip when the pdfium binary is absent; the crop
test is pure image and always runs), 1 no-op golden-corpus harness) plus lint:

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

Python suite, 217 tests (25 data layer, 16 case studies/concepts/courses,
15 seats, 12 auth, 16 submissions (incl. 4 transcription-read), 5 transcription,
14 retrieval (4 indexing, 4 hybrid-search, 6 search endpoint), 28 params
(19 param-spec: the spec round-trip compressed at rest, 7 validation
rejections, the frozen check blocking and the decorative unblock, the reading
cache, no-figures no model call, and the auth surface; 9 auto-parameterize:
the draft with annotations and stored provenance, the document carrying
solution and frozen values but never figure bytes, a frozen proposal locked
out, no positions for an absent literal, idempotent replay, the save-time
edit signal, and the auth surface), 63 imports
(4 decode pipeline + 2 figure pipeline (born-digital + scanned detector),
9 endpoint, 8 confirm/list/metrics, 8 figure verbs (incl. the items read carrying
figures+pages), 5 figure resolve (owner any, seat published-only, 404 hides
existence), 13 item verbs (merge + discard), 1 edit-distance, 5 figure
storage/placement, 4 segmentation, 1 purge, 3 pdfium decoder/extractor that skip
when the binary is absent), 7 backup,
5 compression, 3 contract, 7 store, 1 latency gate) plus lint
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

Web suite (177 Vitest tests: the token contract with its computed-contrast
assertion, the primitives, the API clients, the upload flow's pre-checks,
orchestration controller, SSE processing model, and transcription preview, and
the PDF import upload and controller), plus lint, typecheck, and
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
  five-PDF golden corpus's data (the harness is built, decision 0033; the real
  PDFs are the captured asset it awaits).
- 4.2 (done): figure extraction, the deterministic detector (decision 0025).
  `platform_core.pdf.extract_figures` walks a page's objects: an embedded JPEG
  stream is kept byte for byte (asserted against the source), other rasters are
  lossless PNG, and clustered vector drawings render at 300 dpi with a 2x
  rendition. Behind a `FigureExtractor` seam (`FakeFigureExtractor` in tests);
  the decode pipeline runs it on born-digital pages, storing figures
  content-addressed in the imports bucket (deduped by `figures.content_hash`,
  migration course/0009), rowing only metadata, and placing `![caption](fig://
  {id})` in the page markdown by vertical position. 9 Python tests (placement,
  storage, dedup, the 2x rendition, a real captioned extraction, and the pipeline
  asserting figure bytes never reach the cached markdown) plus 5 Rust figure
  tests. Vision-detector boxes and the `item_figures` link land in 4.3.
- 4.3 (done, bar the vision detector): segmentation (decision 0027). A
  fidelity-strict text pass (`Segmenter` seam, `RecordedSegmenter` in tests,
  `prompts/segmentation/v1`) reads a job's assembled page markdowns (page markers
  and fig:// tokens, no figure bytes) and stages items (question/solution pairs,
  figure assignments, provenance) in `import_items` with `item_figures`
  (migration course/0010), `pending`; a hallucinated figure id is dropped. The
  pipeline runs it as the final step. A 30-day purge (`app/imports/purge.py`)
  removes unconfirmed jobs older than the TTL with their staging and orphaned old
  figures, sparing confirmed and recent ones. 5 tests (staging with the
  no-figure-bytes-in-prompt assertion, empty document, assembly, recorded replay,
  the purge). The vision figure detector closes Stage 1b's union (decision 0028):
  a `FigureDetector` seam (`RecordedFigureDetector` in tests,
  `prompts/figure-detection/v1`) proposes boxes on a scanned page, each cropped
  from the raster by `platform_core.pdf.crop_figures` (pure image, no pdfium)
  into a `page_crop` figure stored and fig://-tokenised like the rest; a pipeline
  test drives it with a real PNG page. Born-digital pages carry deterministic
  figures, scanned pages carry `page_crop`, disjoint by kind.
- 4.4 (backend, done): the confirm endpoint (decision 0029). `POST
  /courses/{id}/import-items/{item_id}/confirm` copies a staged item into a draft
  case study (its question as the body, fig:// tokens intact), marks the item
  `confirmed` and links it (`case_study_id`, migration course/0011), and flips the
  job to `confirmed` so the 30-day purge spares the item and its figures.
  Idempotent; professor-and-owner. `GET .../imports/{id}/items` lists the staged
  items. 6 tests (draft creation, idempotency, figure survives the purge, unknown
  404, non-owner 403, unauthenticated 401). The item is kept in staging because
  it holds the solution Phase 5 needs; the figure verbs are a later backend slice.
- 4.5 (done): the two extraction-accuracy metrics (decision 0030). Confirm now
  takes an optional body (the professor's edited `question_md`, a
  `figure_interventions` count from the surface); the edited text becomes the
  draft body, and `import_item_metrics` (migration course/0012) logs the
  Levenshtein `text_edit_distance` from the extraction plus the interventions, so
  the Phase 8 dashboards can watch the medians. Edit distance is plain Python
  (`app/imports/metrics.py`), off the hot path. 3 tests (the distance unit,
  logging an edited confirm, an unedited confirm logging 0).
- Figure verbs (decision 0031): three of the confirmation surface's verbs are
  built on `item_figures` and `figures`. `PUT .../import-items/{item}/figures/
  {figure}` assigns/sets role (`decorative` excludes from AI context); reassign is
  that PUT plus `DELETE`; `POST .../figures/from-box` crops the page raster at a
  drawn box (`platform_core.pdf.crop_figures`, a page_crop, never a re-render) and
  assigns it. 8 tests (decorative, reassign, unassign 404, unknown-figure 404,
  add-box, unknown-page 404, non-owner 403, and the items read carrying figures and
  pages). Re-crop and split need per-kind re-cropping from the lossless source and
  are deferred to the corpus.
- Figure and source-page image serving (decision 0032): the confirmation read
  returns per-item `figures[]` (presigned crop `image_url`, `fig://` token, role,
  source, dims, page, normalised 0..1 bbox, caption) and per-job `pages[]`
  (presigned page `image_url`); `from-box` returns the new crop's `image_url` and
  dims. bbox is now stored normalised to 0..1 (`normalized_bbox`), so a client
  needs no page dimensions. `GET /courses/{id}/figures/{figure_id}` resolves one
  figure to a presigned URL for both surfaces: a professor-owner gets any figure, a
  seat only one a published case study carries, else an identical 404.
  `ConfirmIn.solution_md` edits the solution. 5 figure-resolve tests (owner any,
  owner unknown 404, seat unpublished 404, seat published 200, seat wrong-course
  403) plus the items-read verb test above. The test_figures bbox assertion and the
  test_confirm items assertion moved to the normalised/`figures[]` shapes.
- Item verbs merge and discard (decision 0034): the surface's last two item
  verbs, pure link-and-state edits. `POST .../import-items/{item}/merge` takes a
  `source_item_id` and folds that sibling into the survivor (question and solution
  appended, figures moved with the survivor's role winning and the link deduped,
  page span and notes combined, confidence the min), retiring the source to
  `state = 'merged'`; a retry 409s because the source is no longer pending (no
  double-append, no ledger). `POST .../{item}/discard` flips a spurious item to
  `state = 'discarded'` (idempotent; a confirmed item 409s). `list_import_items`
  now hides `discarded`/`merged`; confirm 409s on either. 13 tests in
  `test_item_verbs.py` (merge appends+moves+dedups, combines solutions, retry 409,
  self 400, missing-source 404, confirmed-source 409, non-owner 403; discard
  hides, idempotent, confirmed 409, missing 404, confirm-rejects-discarded,
  non-owner 403). Item/figure split stays deferred with 0031's re-crop (it alone
  needs re-cropping from the lossless source, which the five-PDF corpus validates).
- 4.4 (web, front half): the import-from-PDF upload and processing view (frontend
  guide 4.3). A professor picks a PDF (pre-checked against the 60 MiB ceiling),
  it PUTs direct to storage and completes, then a poll of the import status runs
  to "ready" with the page count. Orchestration is a framework-agnostic
  controller with its side-effects injected and tested; the authed calls proxy
  through professor server actions. Reached from an "Import from PDF" link on the
  course page, and its ready state links into the confirmation surface.
Phase 5, in progress:

- 5.1 (done): the parameter spec and the figure-frozen check (decision 0036).
  Typed spec models (`app/params/schema.py`, guide 6.1 plus per-parameter
  `base`), `GET`/`PUT`/`DELETE` `.../case-studies/{id}/param-spec` storing the
  spec compressed in `param_spec_z`, and the frozen check on every save: each
  essential figure's displayed values via the `FigureReader` seam
  (`AnthropicFigureReader` live, `RecordedFigureReader` in tests, prompt
  `figure-reading/v1`), cached once-ever by content hash in `figure_readings`
  (migration course/0013); conflicts are a 409 whose `blocked` extension names
  each parameter, figure, value, and reason; decorative figures are excluded,
  so the figure-verb escape hatch unblocks. The 19 tests in
  `app/params/test_param_spec.py` cover the round-trip (compressed at rest),
  GET-without-spec 404, DELETE, seven validation rejections (inverted range,
  base outside range or options, zero step, unknown type, float in an integer
  range, dirty name), the block (with reason copy and nothing stored), a
  choice value blocked, the decorative unblock via the real figure verb, the
  reading cache (one model call across two saves, provenance row), a
  figure-less case study calling no model, and the auth surface (non-owner
  403, seat 403, 401, unknown case study 404). The phase-gate item "blocks a
  parameter whose value appears in a test schematic and unblocks it when the
  figure is marked decorative" is green; the adversarial verification suite
  and pool-invariant gates arrive with 5.3 and 5.4.

- 5.2 (done): auto-parameterization (decision 0037). `POST
  .../case-studies/{id}/auto-parameterize` drafts a complete spec through the
  `SpecProposer` seam (`app/params/proposal.py`, `AnthropicSpecProposer` live,
  `RecordedSpecProposer` in tests, prompt `auto-parameterize/v1`): the
  confirmed question and solution as delimited untrusted content plus the
  cached frozen display values, parameters back with rationales and exact
  literals, token positions computed server-side from the literal, the frozen
  check re-run on the output (conflicts come back as `frozen` with reasons,
  never in the draft), the payload stored compressed with provenance in
  `spec_proposals` (migration course/0014), Idempotency-Key replay, and the
  param-spec PUT scoring the latest unsaved proposal (kept/changed/dropped/
  added, invariants edit distance) as the prompt-quality signal. The 9 tests
  in `app/params/test_auto_parameterize.py` cover all of it; recorded assets
  land under `apps/api/tests/recorded/auto-parameterize/` (in-memory in the
  gate).

- 4.4 (web, confirmation surface): built against the full contract (figure/page
  serving, confirm, discard, merge, figure verbs). The read renders each detected
  problem as a card: source pages with figure boxes drawn from the normalised
  bboxes, the question and solution with figures inline at their fig:// tokens
  (lazy markdown + KaTeX in their own chunk; route holds at 111 kB),
  low-confidence-first, an "N of M confirmed" line. The full verb set is wired:
  edit, confirm (to a draft), discard, merge (next-in-reading-order into the
  survivor), and the figure verbs on the interactive source page (mark
  essential/decorative, remove, and draw-a-box, which the server crops from the
  lossless source from a normalised bbox; every figure edit bumps the item's
  figure-intervention count sent on confirm). The queue is keyboard-driven (j/k
  to move, a/e to confirm/edit). The items read omits discarded/merged, so every
  verb refetches as the source of truth. Playwright journey four (adjust, merge,
  confirm, draft renders) is written and skip-gated. Two things wait on the
  backend: re-crop-proper (a crop endpoint; it is remove-then-redraw for now) and
  split (404 until the five-PDF corpus), both with the affordance designed. That
  is the whole 4.4 frontend but for those; contract, surface, page-box, and
  keyboard tests are in.

## Standing rules

Model calls in tests are recorded-response mocks, always; live-model smoke
tests run in a separate non-blocking CI lane. `conftest.py` sets `TIRO_TESTING=1`
before the app imports, which makes `load_local_env()` a no-op (decision 0035),
so a developer's `apps/api/.env` never leaks real keys or a broker URL into the
suite; if you add config that a test must exercise, set it explicitly in the test
or conftest, not via `.env`. The realistic course-shard fixture (50 case studies,
500 submissions) becomes the shared data-layer fixture when Phase 1 builds it.
Property tests belong in Rust next to the arithmetic they pin down.

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

Recorded figure-reading responses (the frozen check's displayed-value readings,
a JSON `{"values": [...]}` per figure named for the sha256 of the exact figure
bytes) live at `apps/api/tests/recorded/figure-reading/`, replayed by
`RecordedFigureReader`; the param-spec tests build theirs in memory, so the
gate needs no committed asset.

Recorded segmentation responses live at `apps/api/tests/recorded/segmentation/`,
one JSON array of items per file named for the sha256 of the assembled document
(page markdowns with page markers and fig:// tokens). `RecordedSegmenter` replays
them; the staging tests build theirs in memory, so the gate needs no committed
asset. Recorded figure-detection responses (boxes keyed by the page image hash)
live at `apps/api/tests/recorded/figure-detection/`, replayed by
`RecordedFigureDetector`. Real digital-handwriting PDFs for the student
PDF-upload path (decision 0026, not yet wired) live at
`apps/api/tests/fixtures/submission-pdf/`.

The five-PDF ingestion corpus lives at `crates/platform_core/pdf/corpus/` (PDFs
under `pdfs/`, the spec in `README.md`, baselines in `expectations.json`). The
record-or-assert harness in `pdf/tests/corpus.rs` is complete (decision 0033):
per PDF it decodes and figure-extracts against the recorded baseline, asserting
page classification, a whitespace-normalised text fingerprint, and figure
fidelity (an embedded raster byte-identical by FNV-1a + length, a vector render
hash-stable by dHash within a Hamming tolerance of 6, bbox within 1 pt). It is a
self-documenting no-op while `pdfs/` is empty and skips when pdfium is absent, so
the gate stays green on a bare checkout and is real on CI. The data is the one
missing piece (real problem-set PDFs, an external captured asset like the 30
photos); once they land under `pdfs/`, record with `TIRO_RECORD=1 cargo test -p
tirocinium-pdf --test corpus` and review `expectations.json` before committing,
and capture the figure-detection/segmentation recorded responses from the same
PDFs. Small fixture PDFs
for the decode and figure unit tests live at
`crates/platform_core/pdf/tests/fixtures/` (committed, LFS; generated with
fpdf2/Pillow): a born-digital page, a no-text-layer page, a vector drawing, an
embedded JPEG (with its `source.jpg` for the byte-identical assertion), and a
captioned figure. The pdfium native binary itself is not a
fixture but a provisioned dependency: `infra/setup.sh` downloads the pinned
`chromium/7961` build into `crates/platform_core/pdf/vendor/` (gitignored), and
the decode tests skip without it.
