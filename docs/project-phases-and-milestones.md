# Tirocinium Build Plan
## Phases, milestones, and testing gates for Claude AI developers

Version 0.1 draft. Companion to the backend guide (v0.6), frontend guide (v0.6), and mastery model specification (v0.2). This document turns those guides into an ordered build: nine phases, each with numbered milestones, explicit exit criteria, and the dependencies and tooling to install before starting. It is written for developers working with Claude (Claude Code in the terminal or IDE), so each phase also states what the AI developer should read and set up before writing code.

Two standing rules govern the whole plan. First, a phase is not complete until its testing gate passes and every earlier gate still passes; green does not go red. Second, the guides are the specification and this document is the sequence; when the two disagree, the guides win and this document gets fixed.

---

## Phase 0: Foundations

**Goal.** A monorepo where both developers, and Claude, can work productively from day one: toolchains, CI, the API contract pipeline, and the project knowledge Claude needs in context.

**Milestones.**

0.1 Monorepo scaffold: `apps/api` (Python 3.12, FastAPI), `apps/web` (Next.js 15, TypeScript strict), `crates/platform_core` (Rust workspace, with the existing `tirocinium-mastery` crate moved in as `platform_core::mastery`), `docs/` (the four project documents), `infra/` (docker-compose for dev: MinIO, Redis).

0.2 Toolchain and dependency installation, pinned and scripted in `infra/setup.sh` so a fresh machine (or a fresh Claude session container) reaches a working state in one command:
- Rust stable via rustup, plus `cargo install maturin` and `cargo install cargo-criterion`. If the environment cannot reach rustup (some sandboxes only allow distro archives), fall back to the distro toolchain and keep the dependency pins the mastery crate already carries for Rust 1.75.
- Python via `uv` (preferred) or pip: fastapi, uvicorn, pydantic v2, arq, redis, httpx, python-multipart, argon2-cffi, pyjwt, boto3 (MinIO/S3), zstandard (until the Rust codec lands), anthropic, pytest, pytest-asyncio, ruff, mypy, litestream (binary, in infra).
- Node via pnpm: next@15, react, tailwindcss@4, radix-ui primitives, react-markdown, katex, @tanstack/react-query, openapi-typescript, playwright, vitest, @testing-library/react, lighthouse-ci, axe-core.

0.3 API contract pipeline: FastAPI generates `openapi.json` in CI; `pnpm generate:client` produces the typed client in `apps/web`; a CI check fails if the committed client is stale. This is the seam the two developers meet at, so it exists before either builds features.

0.4 Claude project setup. Write `CLAUDE.md` at the repo root containing: the one-paragraph product summary, the four document paths, the style rules (no em-dashes, flowing prose in docs, EU spelling), the file-location conventions, and the standing testing rules from this plan. Create two project skills using the skill-creator workflow and commit them under `.claude/skills/`: `tirocinium-conventions` (coding standards, API conventions, the no-PII rule, shard access rules, "figures are pixels" and "AI proposes, professor disposes" as inviolable constraints) and `tirocinium-testing` (how to run each suite, what each gate requires, the golden-file corpus locations). These skills are how project law survives context windows; treat them as code and review changes to them like code. Frontend sessions should also use the built-in frontend-design skill when building UI.

0.5 CI (GitHub Actions): lint (ruff, mypy strict, clippy pedantic, eslint), all test suites, the contract staleness check, and criterion benchmark regression thresholds for the Rust crate.

**Testing gate.** `infra/setup.sh` from clean succeeds; CI is green on an empty-but-wired repo; the mastery crate's 15 tests and the store's 7 tests pass inside the monorepo layout; a deliberately stale generated client fails CI.

---

## Phase 1: Data layer, auth, and seats

**Goal.** The storage and identity spine: shards, migrations, backups with a proven restore, professor accounts, and the full seat-code lifecycle.

**Milestones.**

1.1 Shard infrastructure: the connection helper enforcing the exact pragma set (backend 3.2), the single-writer queue per shard, the read pool, `directory.db`, numbered migrations applied per shard at startup.

1.2 Compression layer in `platform_core`: zstd dictionary training and (de)compression exposed to Python; dictionaries per content type stored in shards; the Python `zstandard` fallback removed once this lands.

1.3 Backups: Litestream replication of every shard to object storage plus nightly `VACUUM INTO` snapshots, and a scripted restore drill (`infra/restore-drill.sh`) that restores a course shard to a point in time and verifies row counts and checksums.

1.4 Professor auth: email signup and login, short-lived JWTs, the FastAPI authorization dependency layer with the three roles.

1.5 Seats end to end: generation with Crockford codes, Argon2id storage with prefix index, the one-time CSV and print-PDF card download (signed short-lived URL), redemption issuing opaque course-scoped session tokens, revoke and reissue preserving history, and the strict rate limiting with generic failure messages.

**Testing gate.** Restore drill passes in CI against a fixture shard. Seat property tests: redeemed sessions can never read another seat's rows (dedicated authorization tests, per backend 7.1); revoked seats fail immediately; reissue preserves submission history. Plaintext codes appear in exactly one response ever (asserted by a log-scanning test). Latency budget check on the read path with the 50-case fixture shard.

---

## Phase 2: Courses and case study authoring (first vertical slice)

**Goal.** A professor can sign in, create a course, write a case study in the two-pane editor, and a seated student can read it beautifully. This is deliberately the first full-stack slice so the contract pipeline, auth, and rendering are proven before the hard subsystems.

**Milestones.**

2.1 Backend: course CRUD, case study CRUD with compressed markdown bodies, concept CRUD and case-to-concept mappings (mastery spec section 2), publish states.

2.2 Frontend foundations: design tokens from the guide's palette and type ramp, the primitive set on Radix behaviors, the app shell for both audiences, professor sign-in, the seat-code entry screen with formatted input and honest failure copy.

2.3 Reading surfaces: course home with concept tags and personal state stubs; the problem view with the 68-character column, KaTeX, and the `fig://` resolver component (built now against manually seeded figures so figure rendering is proven before ingestion exists).

2.4 Authoring: the two-pane markdown editor with live typeset preview; strings modules per route group from the start.

**Testing gate.** Playwright journey one (professor authors and publishes; student redeems a code and reads the case) passes on desktop and mobile viewports. Vitest coverage on primitives. Lighthouse CI wired with the budget thresholds on landing, course home, and problem view, and passing. Axe checks clean on the shipped surfaces.

---

## Phase 3: The submission pipeline

**Goal.** Handwritten work flows from a phone camera to indexed, searchable transcription with quality feedback, entirely off the request path.

**Milestones.**

3.1 Upload: presigned direct-to-storage upload with the server-enforced limits, manifest submission, idempotency keys.

3.2 Rust preprocessing in `platform_core`: EXIF fix, downscale, Hough deskew, illumination correction, adaptive binarization, page quality metrics with the early-rejection path and its specific error copy. Golden-file tests against a committed corpus of 30 real phone photos of handwritten worked problems of varying quality (assemble this corpus now; it is a project asset).

3.3 Transcription: the vision-model reading with the strict transcription prompt (LaTeX math, illegible-span tokens, per-region confidence and bounding boxes), cached by page content hash, running in the arq worker with SSE progress to the client.

3.4 Indexing and retrieval: FTS5 insertion, embedding with int8 quantization in `platform_core`, hybrid retrieval with reciprocal rank fusion, the course search endpoint.

3.5 Frontend upload flow: capture and drag-drop, client-side pre-checks, per-page progress and retry, reorder, the processing state, and the transcription preview beside thumbnails with low-confidence highlighting. Hardened on real iOS Safari and Android Chrome, not just emulated viewports.

**Testing gate.** Golden-file suite green with preprocessing outputs within perceptual-hash tolerance. End-to-end Playwright journey two (upload happy path) and three (blurry-page rejection and retake) on mobile viewport. p95 preprocessing under 2 s per page on the corpus. Hybrid retrieval sanity suite: seeded submissions retrieved by both exact terms and paraphrase.

---

## Phase 4: PDF ingestion with figure fidelity

**Goal.** A professor's existing PDF becomes confirmed draft case studies, with every diagram preserved as pixels from the original.

**Milestones.**

4.1 Decode: pdfium extraction for born-digital pages, the scanned-page path reusing Phase 3 preprocessing, page-level markdown with content-hash caching.

4.2 Figure extraction (Stage 1b): the deterministic object-tree walk (lossless embedded-raster extraction, vector-cluster rendering at 300 dpi), the vision detector's proposed boxes, the `figures` and `item_figures` tables, `fig://` tokens placed in the page markdown.

4.3 Segmentation: the fidelity-strict prompt returning items with figure assignments; staging tables; the 30-day purge job.

4.4 Confirmation surface: the card layout with source pages beside the inline-figure reconstruction, the full verb set including the figure verbs (drag-handle re-crop from lossless source, reassign, decorative, draw-a-box), keyboard model, confirmation copying to drafts with re-parented figures.

4.5 The two accuracy metrics logged: text edit distance and figure interventions per item.

**Testing gate.** A committed corpus of five real problem-set PDFs (mixed born-digital and scanned, with schematics, charts, and process diagrams) round-trips with every figure byte-identical (embedded rasters) or hash-stable (rendered regions) and positioned at its token. Playwright journey four: import, adjust one crop, merge two items, confirm, and see the draft render with figures in the problem view. No figure bytes ever appear in a text prompt (asserted in the prompt-assembly tests).

---

## Phase 5: Parameterization, generation, and verification

**Goal.** Confirmed case studies become endless verified variants, with figures frozen and professors in control.

**Milestones.**

5.1 The parameter spec: schema, editor panel backend, the figure-frozen check (cached per-figure vision reading of displayed values, blocking conflicting parameters with the stated reason).

5.2 Auto-parameterization: the proposal call with ranges checked against the solution, token positions, drafted invariants with rationales, the same figure check applied pre-proposal, edit-logging as the prompt-quality signal.

5.3 Generation and verification: seeded sampling, the generate call, the independent re-solve with figures attached as images, the tolerant numeric comparer in `platform_core` (property-tested), flag-versus-verified states, full provenance storage (seed, prompts version, model id).

5.4 The variant pool: pre-generation of 20 verified variants on publish, concurrency caps, seed dedupe, per-course token accounting.

5.5 Frontend: the parameterization panel with manual marking, the auto-parameterize overlay with locked figure values and the two escape hatches, three-sample preview variants, and instant variant swapping in the practice loop from the pool.

**Testing gate.** Verification property: a deliberately corrupted variant (text contradicting its figure, or wrong solution) is always flagged, never served, across a seeded adversarial suite. Pool invariant: a student "new variant" request never waits on generation (asserted under load with an empty-generation-budget simulation). The figure-frozen check blocks a parameter whose value appears in a test schematic and unblocks it when the figure is marked decorative.

---

## Phase 6: Mastery integration

**Goal.** The already-built model goes live: evidence flows from every pipeline, and students and professors see the honest picture.

**Milestones.**

6.1 Wire `platform_core::mastery` through maturin into `apps/api`; move `mastery_store` in as the shard adapter; wrap event insert plus state update in the writer queue's transaction (the known remaining hardening from the reference implementation).

6.2 Evidence emission: `answer_match` from the comparer on every transcribed submission, `working_assessment` from the vision pass with figures attached, `professor_grade` from the grading action triggering supersession replay, all gated by transcription confidence as specified.

6.3 The parameter-version migration path: bulk shard replay under a new parameter set with version recording (mastery spec section 10).

6.4 Frontend: the mastery picture on course home and history (labels always expandable to the evidence trail; never a bare label), the revisit queue presented calmly with one targeted variant per concept, the professor's per-concept distribution view with verbatim common gaps and no per-seat ranking.

**Testing gate.** The crate's 15 tests and store's 7 run in monorepo CI. An end-to-end trajectory test drives seven daily correct submissions through the real pipeline (fixture scans, mocked model calls with recorded responses) and asserts the day-6 solid label. Transactionality test: a crashed write leaves event log and state cache consistent. UI test: every rendered label opens its trail.

---

## Phase 7: The voice defense

**Goal.** The signature learning moment, at conversation-grade latency.

**Milestones.**

7.1 Session and context assembly: variant, reference solution, transcription, essential figures as images, the tutor system prompt with its never-reveal-the-answer and stay-on-task rules, pinned model version for the rubric call.

7.2 The streaming loop: WebSocket transport, streaming STT, streaming TTS with chunked playback, server-side endpointing and barge-in, the 800 ms first-audio target instrumented per turn.

7.3 Closing rubric: the structured JSON verdict validated against the mastery spec's schema, becoming a `defense_rubric` evidence event; transcript compression and storage; raw audio discarded post-session unless saved; length wind-down; per-course concurrency and cost accounting.

7.4 Frontend conversation module: lazy-loaded audio capture and playback queue, speaking and listening states, interruption, permission handling, and the typed fallback preserving the session.

**Testing gate.** Latency harness: p95 first-audio under 800 ms against recorded speech fixtures with mocked provider latencies at realistic distributions. Rubric contract test: malformed tutor output is rejected and retried, never ingested. Safety suite: a scripted stuck-student session never elicits the answer; an off-task session is steered back. Fallback test: killed audio mid-session degrades to text without losing context.

---

## Phase 8: Professor review, reporting, and the seams

**Goal.** The professor's daily surfaces, complete, and the cross-cutting product seams closed.

**Milestones.**

8.1 Submission review: scan beside transcription with region hover-linking and confidence highlighting, grading actions emitting `professor_grade`, keyboard navigation throughout.

8.2 The flagged-variant queue with diffed solutions and promote, edit, or discard.

8.3 Course reporting: activity by seat number, token and cost per course, the two product-health dashboards (recognition confidence distribution, verification pass rate) joined by defense-rubric agreement tracking against grades (the mastery spec's calibration loop).

8.4 The understanding unfold (step-by-step solution reveal with send-to-conversation), and the personal history view.

8.5 Observability completion: OTel traces across the Python-Rust boundary, structured logs, the four dashboards live.

**Testing gate.** Playwright journeys five and six (grade a submission end to end; triage the flagged queue by keyboard). Rubric-agreement report generates correctly from fixture data. Trace continuity asserted across a full submission lifecycle.

---

## Phase 9: Hardening and the bow

**Goal.** Production readiness, and only then the particle hero.

**Milestones.**

9.1 Load testing against every p95 budget in backend section 2 with a simulated 80-seat course under deadline-night traffic shape; fix what fails.

9.2 Security pass: the OWASP checklist against the seat and session model, dependency audit, rate-limit verification under distributed attempts, a red-team pass on prompt-injection via handwritten content and imported PDFs (hostile text in a scan must never steer the tutor or the extractor).

9.3 Accessibility completion: the manual VoiceOver and NVDA passes on all key surfaces, reduced-motion verification, contrast audit on both themes.

9.4 Restore drill and backup verification promoted to a scheduled job with alerting.

9.5 The particle hero: the single lazy-loaded GPU component within its 3 ms frame budget, static fallback, reduced-motion still, pause when off-screen, shipped only with every budget green everywhere else.

9.6 The developers' discretionary list. Time is explicitly reserved here for what the builders judged useful along the way and parked: candidates already visible include a professor onboarding sample course, an export of a seat's term as a bound PDF of their handwritten work, and localization scaffolding activation for French. Additions require a one-paragraph rationale in `docs/decisions/` and must not breach the guides' positions (no dark patterns, no PII, no figure regeneration).

**Testing gate (release gate).** Every prior gate green in one CI run. Load, security, and accessibility sign-offs recorded in `docs/decisions/`. The restore drill has run on schedule twice. Lighthouse budgets green with the particle hero enabled.

---

## Standing practices for every phase

Golden fixtures are project assets: the scan corpus, the PDF corpus, and recorded model responses for deterministic CI live in the repo (LFS) and grow deliberately. Model calls in tests are always recorded-response mocks; live-model smoke tests run in a separate non-blocking CI lane. Every prompt shipped to a model is versioned in `apps/api/prompts/` with a changelog, because prompts are code. And each phase ends with the two Claude skills updated to reflect what is now true, so the next session starts smarter than the last one did.
