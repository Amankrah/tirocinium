---
name: tirocinium-testing
description: How to run every Tirocinium test suite, what each phase gate requires, and where the golden fixtures live. Use in every backend session before starting a milestone and before declaring any work done.
---

# Tirocinium testing

A milestone is done only when its gate is green and every earlier gate still
passes; green never goes red. Last updated at Phase 8 (decisions 0046 to 0050:
the PDF gate preconditions, the submission review read, course reporting, the
understanding unfold, and observability; the backend of Phases 5, 6, 6.5, and 7
is complete and the whole Phase 8 backend, 8.1 to 8.5, is done, leaving only
the frontend's journeys five and six on that gate):
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
frozen filtering, and the save-time edit signal), 5.3 (the generation and
verification loop with the `tirocinium-compare` Rust member and the seeded
adversarial gate), and 5.4 (the variant pool: publish pre-generation, the
sequential fill job as the concurrency cap, per-course token accounting with
the budget check, and the never-waiting practice read) are done. The Phase 5
backend is complete; 5.5 is the frontend's, in progress. Built: the
parameterization panel (the typed editor for the four parameter kinds,
invariants, and solution method, with the figure-frozen 409 surfaced and its
escape hatches); the auto-parameterize review overlay (the proposal highlighted
in place at the verified positions, range and rationale chips, invariant
rationales, figure locks, accept-into-the-form); and the practice loop, where the
problem view serves a pooled variant and "New variant" swaps another in through a
lazy client renderer (no generation spinner, route at 114 kB) and "Upload
solution" carries the variant id into the upload flow, which finally makes that
path live rather than seed-only (the 3.5 gap, closed); preview variants (generate
three, poll the pool, render each verified body, a flagged one links out); and
the flagged review queue (guide 4.4, the Phase 8.2 surface pulled forward on its
live 5.3 contract: the two solutions side by side, promote/edit/discard, refetch
as the source of truth). Phase 5.5 is complete. The Phase 8.2 review queue is
therefore also done ahead of its slot.
The Phase 6 backend is complete: 6.1 (the store inside the writer
transaction, the evidence trail exposed through the wheel), 6.2 (answer_match
and working_assessment emission in the worker, the grade endpoint with
supersession), 6.3 (the parameter-version migration path), and the mastery
API surface (the seat picture with trails, the revisit queue, the professor
distribution); 6.4's rendering is built (web): the student mastery picture and
revisit queue on course home and the professor's class distribution, all as
Server Components with the label-never-bare rule honoured through a native
disclosure element (zero client JS on course home, 106 kB), the revisit queue calm and
empty-when-empty, and the distribution anonymous counts with the gaps slot
awaiting Phase 7. So Phase 6 is complete but for a Playwright pass on the mastery
labels; the professor grade endpoint is live for the Phase 8.1 review surface.
Phase 6.5 (student input modes, decision 0026): 6.5.1 (mode B) is done, the
exported handwriting PDF expanding to rasters in the submission pipeline
behind the `PdfDecoder` seam, limits re-enforced post-render, rows rewritten
in one writer transaction, the cache keyed on rendered bytes, with the
parity gate green (photo and PDF of the same handwriting reach the same
transcription and evidence shape) and a skip-gated real-fixture round trip
over the committed tablet PDFs; 6.5.2 and 6.5.3 are built (web, decision 0042):
the upload surface opens on a three-mode picker (photos, handwriting PDF, write
here), the file modes doubling as the no-pointer fallback, and mode C is a
lazy-loaded pen pad (a pointer canvas exporting each page to a PNG that joins the
same page list and orchestration, so mode C reduces to mode A). Vitest covers the
pad's surface contract and the mode switch; the mode-C journey drives the pad end
to end, seed-gated. Phase 6.5 is complete.
The Phase 7 backend is complete (7.1 to 7.3; 7.4, the conversation module, is
the frontend's): context assembly, the transport-agnostic turn engine behind
streaming speech seams with Deepgram Flux and Cartesia Sonic adapters, the
WebSocket surface with its per-course concurrency cap, and the closing rubric
that becomes defence evidence. All four gate items are green, the latency one
thinly so (782 ms p95 against 800).
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

Rust workspace, 74 tests (mastery 15: 6 property, 9 scenario; codec 8;
preprocess 8: 7 synthetic-image pipeline tests, 1 golden-corpus harness that is
a no-op until the corpus lands; embedding 10: 7 scenario, 3 property; pdf 11:
3 decode and 6 figure tests (5 need pdfium and its LFS-tracked fixture and skip
naming whichever is absent, decision 0046; the crop test is pure image and
always runs), 1 testkit test pinning the LFS-pointer detector, 1 no-op
golden-corpus harness; compare 22:
17 scenario (number-format reading, tolerance, structural mismatches, stable
strings, and answers_in_text's containment: found, wrong, contiguous-run,
nothing-comparable), 5 property (self-match, symmetry, tolerance monotonicity,
scientific notation invariance, beyond-tolerance perturbation always
mismatches)) plus lint:

    cd crates/platform_core
    cargo test --workspace
    cargo fmt --all -- --check
    cargo clippy --all-targets -- -D warnings
    cargo clippy -p tirocinium-mastery --features python -- -D warnings
    cargo clippy -p tirocinium-embedding --features python -- -D warnings
    cargo clippy -p tirocinium-pdf --features python -- -D warnings
    cargo clippy -p tirocinium-compare --features python -- -D warnings

Criterion benches with the absolute-budget regression gate (decision 0004;
budgets live in `crates/platform_core/bench-thresholds.json`, revised only
deliberately and with the reference means in the file updated to match). The
preprocessing bench `preprocess_page_a4` is the exception to the 25-30x rule:
it is budgeted at the guide's hard 2 s-per-page SLO (reference mean 408 ms), so
it gates the product budget directly:

    cd crates/platform_core
    cargo bench --workspace
    python ../../infra/check-bench-thresholds.py

Python suite, 462 tests (25 data layer + 9 backup verification (9.4), 4 load
(9.1), 34 security (9.2), 16 case studies/concepts/courses,
16 reports (8.3), 36 unfold (8.4: 18 stepper, 18 surface), and 22 telemetry
(8.5), see the gate table,
15 seats, 12 auth, 16 submissions (incl. 4 transcription-read),
12 submission review (8.1: the list with seat numbers, cursor pagination, the
status and variant filters, the empty course; the detail with regions and both
renditions, the unprocessed status, the unknown 404; the page-rendition refresh
and its 404; the grade reading back; the professor-and-owner surface; the
course-in-the-path scope; and the no-PII assertion), 5 lfs (the LFS-pointer
detector, decision 0046), 12
transcription (5 pipeline; 7 mode B: PDF expansion and re-sequencing, the
mixed photo+PDF order, the over-limit rejection copy, retry neither
re-decodes nor re-reads, no-decoder failure, the photo/PDF parity gate, and
the skip-gated real tablet-PDF round trip),
14 retrieval (4 indexing, 4 hybrid-search, 6 search endpoint), 28 params
(19 param-spec: the spec round-trip compressed at rest, 7 validation
rejections, the frozen check blocking and the decorative unblock, the reading
cache, no-figures no model call, and the auth surface; 9 auto-parameterize:
the draft with annotations and stored provenance, the document carrying
solution and frozen values but never figure bytes, a frozen proposal locked
out, no positions for an absent literal, idempotent replay, the save-time
edit signal, and the auth surface), 41 variants (4 sampling, 18 pipeline of
which 12 are the seeded adversarial gate (3 seeds x 4 corruption modes,
always flagged and never in the verified list), 9 surface: enqueue, seed
idempotency, no-spec 409, state filters, the flagged diff read, promote,
edit, discard, auth; 10 pool: fill-to-target with token accounting,
idempotent top-up, the flagging attempt ceiling, the exhausted budget,
publish enqueues (and not without a spec), the seat read without a solution,
exclude, flagged never practised, draft invisibility, and the 50-request
empty-budget pool-invariant gate), 63 imports
(4 decode pipeline + 2 figure pipeline (born-digital + scanned detector),
9 endpoint, 8 confirm/list/metrics, 8 figure verbs (incl. the items read carrying
figures+pages), 5 figure resolve (owner any, seat published-only, 404 hides
existence), 13 item verbs (merge + discard), 1 edit-distance, 5 figure
storage/placement, 4 segmentation, 1 purge, 3 pdfium decoder/extractor that skip
when the binary or the LFS fixture is absent), 7 backup,
20 mastery (7 emission incl. the transactionality gate, 1 end-to-end
seven-day trajectory gate, 9 surface: seat picture with trails and
seat-only auth, revisit targeting per spec section 5, distribution counts
and auth, the defence-named gaps verbatim and most frequent first, grading
with supersession and auth, 3 parameter-version migration), 42 defence (4 context assembly, 6 engine turn-taking, 8 close
(the rubric contract, evidence, transcript, accounting, and the no-audio-column
assertion), 9 surface and WebSocket transport, 3 safety, 2 fallback, 8 provider
wire translation, 2 latency: the p95 gate and the loop-adds-nothing
regression), 5 compression, 3 contract, 8 store, 1 latency gate) plus lint
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

Web suite (225 Vitest tests: the token contract with its computed-contrast
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

- 5.3 (done): generation and verification (decision 0038). The
  `tirocinium-compare` member (tolerant numeric comparer: number-format
  reading with documented separator rules, `max(abs, rel*max)` tolerance,
  element-wise ordered lists, conservative toward flagging; property-tested,
  bench-budgeted, exposed as `platform_core.compare`). Seeded sampling as a
  pure function of (spec, seed). The worker job `generate_variant`: one
  generation call (body + solution + structured final answers), server-side
  fidelity checks (fig:// token multiset preserved, answers exist) before the
  verify call is spent, the independent re-solve seeing the question only with
  essential figures attached as images, the comparer deciding, and the row
  stored with full provenance under a unique `(case_study_id, seed)`. The
  variant surface: enqueue with key-derived seeds, state-filtered list, the
  flagged diff detail, promote/edit/discard. The phase gate's verification
  property is green: 3 seeds x 4 corruption modes (wrong solution, text
  contradicting its figure, dropped figure token, no answers) all flag and
  never appear in the verified list. The pool invariant gate is 5.4's.

- 5.4 (done): the variant pool (decision 0039). Publish enqueues
  `fill_variant_pool` for a spec'd case study; the fill (`app/variants/pool.py`,
  one sequential job per case study, the structural concurrency cap) tops up
  the shortfall to `TIRO_VARIANT_POOL_TARGET` (default 20), bounds flagged
  attempts at 3x target, and stops on the rolling-30-day
  `TIRO_GENERATION_TOKEN_BUDGET` read from `token_usage` (migration
  course/0016, written by the pipeline per model call). The practice read
  (`GET .../case-studies/{id}/practice-variant?exclude=`) serves a random
  servable variant (never flagged, never a solution, published-only for
  seats) and answers a dry pool with the base body instantly plus a
  background top-up. The pool-invariant phase gate is green: fifty
  consecutive reads against a dry pool with a zero budget all answer
  instantly with zero request-path model calls.

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

Phase 6, backend complete (decisions 0040, 0041):

- 6.1 (done): the crate's tests and the store's 8 run in CI as they have
  since Phase 0; the remaining hardening is in: every evidence write goes
  through `MasteryStore` inside one `ShardWriter.run` transaction, and the
  gate's transactionality test (a crashed write between event insert and
  state update leaves both tables empty) is green. `evidence_trail_json` is
  exposed through the wheel and the store's `trail()` renders over the
  superseded stream.
- 6.2 (done): evidence emission as a worker step after indexing, idempotent
  per submission. answer_match via `platform_core.compare.answers_in_text`
  (essay answers or a numberless reading emit nothing; region-level
  confidence); working_assessment via the `WorkingAssessor` seam
  (`RecordedWorkingAssessor` in tests, prompt `working-assessment/v1`,
  figures as images, rubric/3, confidence = overall x model, unmapped
  concepts dropped); the grade endpoint emits professor_grade with
  supersession replay in the same transaction. The end-to-end trajectory
  gate is green: seven daily correct submissions through the real
  transcription pipeline (fixture scans, recorded transcriber and assessor)
  reach the solid label on day 6, read through the seat API with its trail.
- 6.3 (done): the parameter-version migration path. `mastery_params` in the
  directory (migration directory/0004), `active_params_json` falling back to
  the crate defaults, `activate_params` + `replay_course` +
  `activate_and_replay_all` (`app/mastery/params.py`,
  `scripts/migrate_mastery_params.py`), version recorded on every recomputed
  state. 3 tests.
- The mastery API surface behind 6.4: `GET .../mastery` (seat-only, every
  concept with label and trail, unseen explicit), `GET .../revisit` (spec
  section 5 targeting exactly), `GET .../mastery/distribution`
  (professor-and-owner, label counts, `gaps` empty until Phase 7),
  `POST .../submissions/{id}/grade`. 6.4's rendering (labels always
  expandable, the calm queue, the distribution view) and the gate's UI test
  ("every rendered label opens its trail") are the frontend's.

Phase 7, backend complete (decisions 0043, 0044):

- 7.1 (done): session context assembly. Exactly the three sources guide 6.5
  names (the variant, the professor's reference solution, the student's own
  transcription) as delimited untrusted content, the essential figures attached
  as pixels, the mapped concepts by id so the rubric can score them, and the
  versioned `defense-tutor/v1` persona carrying the never-reveal, stay-on-task,
  and text-is-data rules. The 4 tests cover the three sources and figures (byte
  for byte, never in the text), no seat identity in the prompt, an unprocessed
  submission having no context, and a decorative figure staying unattached.
- 7.2 (done): the streaming loop. `DefenseEngine` is transport agnostic, so the
  WebSocket route, the safety suite, and the latency harness drive the same
  loop: the recognizer's endpoint flag closes a student turn, reply text streams
  into synthesis with audio out before the reply is complete, fresh speech or a
  typed turn cancels a reply in flight, the session winds down two turns before
  its cap and stops at it. The 6 engine tests cover those plus the typed
  fallback and figures reaching the tutor as pixels. Speech lives behind two
  Protocols (`app/defense/speech.py`) with Deepgram Flux and Cartesia Sonic
  adapters; the sockets are live integrations for the smoke lane, but the wire
  translation is pure and pinned by 8 tests (only `EndOfTurn` commits a turn,
  the eager ending never does, noise is ignored, the incremental synthesis
  protocol under one context id, the audio frames, and the registry falling to
  typed sessions with nothing configured and failing loudly on a typo).
- 7.3 (done): the closing rubric and the accounting. 8 tests: a valid verdict
  becomes one `defense_rubric` event per discussed-and-mapped concept
  (reasoning/3, the tutor's session confidence, the mapping weight) inside the
  same transaction that stores the compressed transcript; the gate's rubric
  contract (malformed output rejected, retried once, never ingested); unmapped
  concepts dropped; no student turns means no rubric call; the pinned rubric
  model; token and speech usage per course; and no column anywhere holding
  audio. The surface (9 tests) is seat-only on the seat's own processed
  submission, caps live conversations per course with an honest 409 while
  sweeping stale rows, authenticates the socket by query-parameter token (4401)
  and hides another seat's conversation (4404), and runs the whole loop through
  the transport to a verdict.
- The gate's four items are green. Latency: the harness in
  `app/defense/test_latency.py` drives 200 turns on a virtual clock against
  decision 0044's measured provider distributions and reports a 634 ms median
  and 782 ms p95 against the 800 ms budget, with p99 at 828 ms, so the margin is
  thin and the harness is a gate to defend, not a result to celebrate; re-run it
  first whenever a provider or the tutor model changes. Rubric contract: in the
  close tests above. Safety: 3 tests drive a stuck student escalating from
  pleading to instructing and an off-task session with an injection, asserting
  that no fragment of the ground truth reaches captions, transcript, or verdict,
  that the three hard rules travel with every turn, and that hostile text from
  the student or from a scanned page is carried as delimited data. Fallback: 2
  tests kill each speech layer mid-session (a dropped recognizer socket, a
  refused synthesis connection) and assert the session continues, says so once
  (`speech_down`, `audio_down`), keeps the reply whose audio died as captions and
  as a turn, and hands the tutor the whole conversation across the mode switch.

Phase 8, in progress:

- 8.1 (backend, done): the professor's submission review read (decision 0047).
  Grading landed with 6.2, so this is the read half: `GET
  /courses/{id}/submissions` (the review queue, cursor-paginated, filterable by
  `status` and `variant_id`, carrying seat number, case study, mean recognition
  confidence, and the grade already given), `GET .../submissions/{id}` (the scan
  beside the transcription: per page a presigned scan URL, the grayscale
  rendition the model read, the reading with region boxes and per-region
  confidence), and `GET .../submissions/{id}/pages/{n}` (fresh presigned URLs
  for one page, because presigned links outlive nothing and a review session
  outlives them). Professor-and-owner throughout, a separate course-scoped
  router in `app/submissions/review.py` so the seat endpoints keep no role
  branch. No migration: `submissions.grade`/`graded_at` (0017) and the page
  renditions (0005, 0008) already held everything. Seat numbers resolve from the
  directory in Python, never a cross-shard SQL join. The 12 tests in
  `app/submissions/test_review.py` cover the list (seat numbers, status and
  confidence, cursor pagination, the status and variant filters, the empty
  course), the detail (scan beside transcription with regions and both
  renditions, an unprocessed submission reporting its status rather than 404, an
  unknown id 404), the page-rendition refresh (and its 404), the grade reading
  back on list and detail, the authorization surface (401, non-owner 403, a seat
  refused on all three routes), the course-in-the-path scope (a colliding id
  from a busy course does not resolve against an empty sibling), and the no-PII
  assertion extended to this surface (no professor email, no seat token, the
  seat number the only identifier).
- 8.2 (done ahead of its slot): the flagged-variant queue, built on the 5.3
  contract during 5.5.
- 8.3 (done): course reporting and the two product-health dashboards
  (decision 0048). Four professor-and-owner reads under
  `/courses/{id}/reports/`, no new table and no migration: `/activity` (every
  seat by number with submissions, graded, defences, last submitted; ordered by
  seat number, never by volume, since a report sorted by who did most is the
  ranking lens spec section 6 rules out), `/usage` (token and speech spend by
  kind and model, `?since=`), `/health` (recognition confidence in ten buckets
  with mean and rejected count, plus the verification pass rate), and
  `/rubric-agreement` (the spec section 10 calibration loop). The 16 tests in
  `app/reports/test_reports.py` cover the activity rows and totals including a
  silent seat at zero, usage aggregation and the window, the unpriced and priced
  paths, the confidence buckets and an empty distribution, the pass rate and its
  null without generated variants, the agreement means and signed bias, the
  both-halves requirement, the single-pair null correlation, and Pearson on a
  perfectly correlated series, plus the auth surface and the no-PII assertion.
  Prices are configuration, never code: with no `TIRO_MODEL_PRICES` /
  `TIRO_SPEECH_PRICES` the reports carry real usage, null costs, and
  `priced: false`. Every statistic is null rather than fabricated when its
  denominator is empty, so a test that expects 0.0 from an empty course is
  testing the wrong thing.
- 8.4 (done): the understanding unfold and the personal history (decision
  0049). The stepper (`app/unfold/steps.py`) splits a worked solution
  deterministically in Python, never by a model: block boundaries and top-level
  list items, with fenced code and display math atomic and a bare heading
  joining the block it introduces. Its 18 tests carry a shared fidelity
  assertion (`assert_faithful`) that every step's span is ordered,
  non-overlapping, exactly its text, and separated only by whitespace, so
  nothing the professor wrote is lost, moved, or altered; add new stepper cases
  through that helper, not around it. The surface (`app/unfold/routes.py`,
  migration course/0019 `solution_reveals`): `GET
  .../variants/{id}/solution` returns total steps plus the ones the seat has
  unfolded (a professor-owner sees all of it), and `POST .../solution/reveal`
  takes an absolute `through_step` so a retry never rewinds. A seat who has
  neither submitted nor revealed gets a 403 whose copy names both routes in;
  the first reveal without a submission records `gave_up`. `GET
  .../history` is the seat's own submissions newest first, seat-only like the
  mastery picture, cursor walking backwards through ids. 18 surface tests cover
  the gate, step-by-step reveal (with the unrevealed text genuinely absent from
  the payload), no-rewind and past-the-end, giving up recorded and not recorded,
  seat isolation, the professor read, an unpublished variant 404, the auth
  surface, the shared numbering, history ordering, isolation, pagination,
  seat-only, and no PII.
  Note the coupling: 8.4 renumbered the reference solution inside the tutor's
  context and states how far the student has read, so the persona moved to
  `defense-tutor/v2` and `test_context.py` asserts v2 plus the numbering. A
  prompt bump like that breaks the provenance assertion, not the recorded
  replays, which are ordered rather than hash-keyed.
- 8.5 (done): observability (decision 0050). `app/telemetry.py` owns the lot:
  JSON logs carrying trace and span ids, spans, the W3C carrier that crosses
  the queue, and the four dashboards' instruments. The gate's item, trace
  continuity across a full submission lifecycle, is asserted twice: once on the
  primitives and once through the real seams (`ArqTaskQueue` with a fake pool
  injecting, `worker.run_job` resuming, the real transcription pipeline running
  under it with the native preprocess span inside). Both halves are
  mutation-checked: dropping `trace_context` from the enqueue or ignoring the
  carrier in `continued_span` fails the gate. Rust boundary spans are opened on
  the Python side of the PyO3 call (preprocess, embedding quantize, compare,
  pdfium); the codec is deliberately uninstrumented. Dashboards live as data in
  `infra/dashboards.json`, and a test pins that every panel queries an
  instrument the code emits, so renaming an instrument without the dashboard
  fails. The 22 tests are in `app/test_telemetry.py`.
  One gotcha: adding OTel means `uv sync` prunes `platform_core`, so rebuild the
  wheel after any dependency change (the command is above). (An earlier note
  here blamed faulthandler dumps on piping pytest to `tail`. That was wrong; see
  the segfault entry under 9.2.)
- Phase 8's remaining gate items are the frontend's: Playwright journeys five
  and six. Still open from 8.4: frontend guide 4.2's (started, submitted) span
  has no `started_at`, so the history view cannot show engaged time yet.

Phase 9, in progress:

- 9.1 (done): load against the guide's p95 budgets (decision 0051).
  `app/test_load.py` drives the real ASGI app concurrently, sixteen redeemed
  seats through the practice reads and the write path, against the realistic
  fixture shard, and asserts reads p95 under 150 ms and writes under 400 ms with
  a separate test that reads stay inside budget while every seat writes at once
  (the single-writer queue's most load-sensitive claim). Current margins are
  wide: reads ~28 ms, writes ~36 ms, reads-under-write-load ~59 ms, printed on
  every run. The gate asserts every response is 2xx and that the expected call
  count was made, because a 404 is fast and a run full of them would report a
  flattering p95 while measuring nothing; keep that assertion when editing the
  workload. Building the world trips the redemption rate limiter (10/IP/hour),
  so the harness redeems each seat from its own address rather than disabling
  the control.
- 9.2 (done): the security pass (decision 0052, checklist in
  `docs/security-review.md`). `app/security/` holds 34 tests: an access sweep
  over the live route table asserting every non-public route 401s (four public
  routes enumerated; mutation-checked with a planted route), token forgery
  (tampered, foreign secret, expired, `alg: none`), cross-role refusals, a
  revoked seat dying at once, generic auth copy, and no stack traces or SQL in
  error bodies; rate limiting including the honest negative result that per-IP
  throttling does not stop a distributed attempt (entropy does, asserted as
  80 bits) and the positive one that per-IP limiting stops an attacker locking
  the class out; and the prompt-injection red team.
  The red team found a real vulnerability and it is fixed: the prompt fence used
  fixed markers, so a page writing `content>>>` escaped it into the document's
  own voice. `app/prompt_safety.py` now mints a per-document nonce; every
  untrusted block goes through `fence.wrap()` and never by hand. Recorded seams
  key on `document_key()` (canonical, nonce normalised out) so replays stay
  deterministic; if you add a model seam, key it that way or every replay will
  miss. `RecordedTutor.seen_rubric_systems` was added because the closing rubric
  call carried the hard rules in fact but in no test.
  Dependency audit, both halves (decision 0054). Python: one advisory,
  PYSEC-2026-1845 on pytest 8.4.2 (dev only), fixed in 9.0.3. Rust: `cargo audit`
  now runs in CI as the `rust-audit` job, with RUSTSEC-2025-0020 and
  RUSTSEC-2026-0177 (both pyo3 0.23.5) ignored by id so a new advisory still
  fails; upgrading pyo3 fixes both and was rejected on measurement, see below.

  **The suite segfaults about one full run in ten.** Read this before trusting a
  green run or diagnosing a crash. It is mid garbage collection on an anyio
  worker thread inside Starlette request handling, it predates Phase 9, and it
  is independent of pytest version (8 and 9) and pyo3 version (0.23 and 0.29).
  Measured rates on the full suite: pyo3 0.23 five crashes in fifty runs, pyo3
  0.29 five in twelve, which is why the pyo3 upgrade (and with it the pytest
  one, whose earlier failure was this same crash) is not landed. It does not
  reproduce running the newer suites alone, only across the whole suite. Next
  step is a native backtrace with `core_pattern` set to a plain file, since
  apport intercepts cores on this host. Never conclude a gate is green, or red,
  from one run.
- 9.4 (done): the scheduled backup drill with alerting (decision 0053).
  `.github/workflows/backup-drill.yml` runs daily (05:20 UTC, plus manual
  dispatch): the restore drill, then a snapshot-and-verify loop against real
  MinIO. `app/db/backup.py` gained `verify_snapshots` (newest object per shard;
  fails on missing, stale past 36 h, or zero bytes) with
  `scripts/verify_backups.py` as the command; discovering no shards exits
  non-zero, because verifying nothing is not verification. 9 tests in
  `app/db/test_backup_verify.py` cover each failure mode plus the paginated
  listing. Both the pass and fail paths were proven against a real MinIO here,
  not only reasoned about.
  Alerting is a GitHub issue on failure (a comment on the open one rather than a
  second issue; closed automatically when green again), plus a webhook when
  `TIRO_ALERT_WEBHOOK` is set. The release gate wants this to have run on
  schedule twice, which only real elapsed days can supply.
  Fixed on the way: `infra/setup.sh` and `infra/restore-drill.sh` were recorded
  in git as non-executable while `ci.yml` invokes them as `./infra/...`, so
  those jobs would have failed on a permission error. If you add a script under
  `infra/`, check `git ls-files -s` shows 100755.
- Phase 9's remaining backend item is 9.6's discretionary list; 9.3 and 9.5 are
  the frontend's. Carried forward: the redemption limiter is in-memory and
  per-process, so a multi-process deployment multiplies the allowance by the
  worker count.

Recorded working-assessment responses live at
`apps/api/tests/recorded/working-assessment/`, one JSON per document sha256
(`WorkingAssessment` shape: per-concept rubric 0..3 plus one stated
confidence), replayed by `RecordedWorkingAssessor`; the emission tests build
theirs in memory, so the gate needs no committed asset.

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

An LFS-tracked fixture is a short text pointer until `git lfs pull` has run, so
every fixture-backed test checks for that and skips naming it, exactly as it
skips when the pdfium binary is unprovisioned (decision 0046):
`platform_core::pdf::testkit::ready` on the Rust side, `app.lfs.any_unfetched`
plus `SKIP_REASON` on the Python side. Without both preconditions those tests
assert nothing, which is why CI checks out with `lfs: true` and runs
`infra/provision-pdfium.sh` in the `rust`, `api`, and `setup-script` jobs;
`infra/setup.sh` does the same locally and warns when git-lfs is missing. If
you see `PdfiumLibraryInternalError(FormatError)`, that is an unfetched pointer
reaching pdfium, not a decode regression: install git-lfs and pull. On a host
without git-lfs those tests skip, so read a green local run as "not verified
here", and check the CI run before calling a PDF gate green.

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

Recorded variant-generation and variant-verification responses (guide 6.3)
live at `apps/api/tests/recorded/variant-generation/` and
`.../variant-verification/`, one JSON per document sha256
(`GeneratedVariant` / `ReSolveResult` shapes), replayed by
`RecordedVariantGenerator` / `RecordedVariantVerifier`; the pipeline tests
build theirs in memory, so the gate needs no committed asset.

Recorded segmentation responses live at `apps/api/tests/recorded/segmentation/`,
one JSON array of items per file named for the sha256 of the assembled document
(page markdowns with page markers and fig:// tokens). `RecordedSegmenter` replays
them; the staging tests build theirs in memory, so the gate needs no committed
asset. Recorded figure-detection responses (boxes keyed by the page image hash)
live at `apps/api/tests/recorded/figure-detection/`, replayed by
`RecordedFigureDetector`. Real digital-handwriting PDFs for the student
PDF-upload path (decision 0026, not yet wired) live at
`apps/api/tests/fixtures/submission-pdf/`.

Recorded defence sessions live at `apps/api/tests/recorded/defense/`, one
directory per scripted session holding `replies.json` and `rubrics.json` (raw
verdicts in order, so a test can stage a malformed one followed by a well-formed
retry), replayed by `RecordedTutor.from_dir`; the latency, safety, and fallback
tests build their scripts in memory, so the gate needs no committed asset, and
the directory is where the sessions the live-model smoke lane replays land.
Speech is never recorded: audio is not retained anywhere, and the speech seams
are driven by scripted timings in `app/defense/conftest.py`. Versioned prompts
live at `apps/api/prompts/defense-tutor/` and `apps/api/prompts/defense-rubric/`.

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
