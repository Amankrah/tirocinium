# Backend Development Guide
## Tirocinium: Case Study Practice Platform for University Students and Professors

Version 0.6 draft. Audience: backend engineers joining the project. This guide defines the architecture, stack, data strategy, and engineering conventions for the Tirocinium backend. Read it fully before writing code.

---

## 1. What we are building

The platform, named **Tirocinium** (Latin: the ancient Roman period of supervised practice through which a novice became competent), lets professors publish case studies and challenge problems, and lets students practice them and submit handwritten solutions as scans or photos. Four capabilities define the backend:

1. **PDF problem ingestion.** A professor uploads an existing PDF of problems with solutions (a past exam, a problem set, a casebook chapter). The backend decodes it to markdown, an AI subsystem segments it into question and solution pairs, and nothing is stored as course content until the professor has confirmed each extracted pair.
2. **Parameterized problem generation.** A professor marks the parts of a case study that can vary (numbers, entities, constraints, scenario framing), or asks the AI to propose the parameterization automatically. An AI model then generates fresh but pedagogically equivalent variants, each with a worked solution, so students can practice the underlying concept repeatedly without memorizing a single instance.
3. **Handwritten solution ingestion and retrieval.** Students upload scanned handwritten work. The backend preprocesses the images, runs handwriting recognition, and indexes the recognized content so professors can search, review, and compare submissions.
4. **Efficient SQLite-based storage.** The data layer is SQLite, deliberately, with compression and sharding strategies that keep read and write paths fast at university scale.

## 2. Architecture overview

The backend is a Python service with Rust extensions on the hot paths. Do not build a microservice mesh for this; a modular monolith with clear internal boundaries will serve the project better at this scale and keep operational overhead low.

```
Next.js frontend
      |
      v
FastAPI application (Python 3.12)
  ├── auth module (professor accounts, student seat codes)
  ├── courses module (case studies, enrolment)
  ├── generation module (AI variant pipeline)
  ├── submissions module (upload, review, grading)
  └── retrieval module (search over recognized text)
      |
      ├── Rust extension crate via PyO3 (image preprocessing, compression codecs)
      ├── SQLite shards (one database file per course)
      ├── Object storage for original scans (S3-compatible; MinIO in dev)
      └── AI provider (Anthropic API) for generation and handwriting reading
```

### Why Python plus Rust, and where the line sits

Python (FastAPI) owns orchestration, auth, business rules, and AI provider calls, because iteration speed matters most there and the latency is dominated by network and model inference, which Rust cannot improve. Rust owns the CPU-bound paths where it genuinely reduces tail latency and cost:

- **Image preprocessing** of uploaded scans: deskew, denoise, adaptive binarization, contrast normalization, and tiling. This runs on every upload and is 10 to 40 times faster in Rust with `image` and `imageproc` than in Python, which keeps the upload-to-feedback loop under two seconds.
- **Compression codecs**: zstd dictionary training and (de)compression of stored text blobs and embeddings, exposed to Python as zero-copy functions.
- **Batch reindexing** jobs that walk entire course shards.

Ship the Rust code as a single crate (`platform_core`) built with maturin and imported in Python as a wheel. Do not run Rust as a separate network service; the PyO3 boundary avoids serialization and an extra hop. Release the GIL inside long Rust calls so FastAPI workers stay responsive.

Latency budget to hold: p95 under 150 ms for API reads, under 400 ms for writes excluding AI calls, and under 2 s for scan preprocessing on a 300 dpi A4 page.

## 3. Data layer: SQLite done properly

SQLite is a strong fit here because the workload shards naturally by course, reads dominate writes, and single-file databases simplify backup, archival, and per-course data export (which universities will ask for). The constraint to respect is SQLite's single-writer model. The design below works with that constraint rather than against it.

### 3.1 Sharding: one database per course

Each course gets its own SQLite file: `data/courses/{course_id}.db`. A small central `directory.db` holds users, sessions, course registry, and cross-course lookups. Consequences:

- Write contention is limited to one course at a time, which in practice means one professor and their class, so the single-writer model is rarely felt.
- A course archive is literally one file copy.
- Hot courses can be moved to faster storage independently.

Never join across shards in SQL. Cross-course queries go through the directory database or application-level aggregation.

### 3.2 Connection and pragma configuration

Open every connection with this exact configuration, enforced in one shared helper (no ad hoc connections anywhere in the codebase):

```sql
PRAGMA journal_mode = WAL;          -- readers never block the writer
PRAGMA synchronous = NORMAL;        -- safe with WAL, much faster than FULL
PRAGMA cache_size = -64000;         -- 64 MB page cache per connection
PRAGMA mmap_size = 268435456;       -- 256 MB memory-mapped reads
PRAGMA busy_timeout = 5000;
PRAGMA foreign_keys = ON;
PRAGMA temp_store = MEMORY;
```

Use a single dedicated writer connection per shard behind an async write queue in the application, and a pool of read-only connections. This serializes writes explicitly instead of letting them collide on `busy_timeout`.

### 3.3 Compression strategy

Compression here has three distinct layers. Apply each where it pays, and measure before and after with a real course fixture.

**Application-level zstd with trained dictionaries (primary mechanism).** Case study bodies, generated variants, model-produced solutions, and recognized handwriting text are all natural-language blobs with heavy shared vocabulary. Train a zstd dictionary per content type (one for problem text, one for recognized handwriting) on an initial corpus, store dictionaries in the shard, and compress every blob column with the matching dictionary at level 7. Expect 4 to 8 times reduction on this content. The Rust crate exposes `compress(blob, dict_id)` and `decompress(blob, dict_id)`; Python never touches raw zstd.

**Embeddings quantization.** Store retrieval embeddings as int8-quantized vectors (scalar quantization with per-vector scale), which cuts vector storage 4x with negligible retrieval loss at this corpus size. Store the float32 originals only for the current model version, compressed as a zstd blob, so you can requantize after a model change.

**Do not store scan images in SQLite.** Original scans and preprocessed page images go to object storage; SQLite holds metadata, storage keys, page hashes, and the recognized text. This keeps shard files in the tens of megabytes rather than gigabytes and keeps `VACUUM` and backups fast.

Periodically run `PRAGMA optimize;` on connection close and schedule `VACUUM INTO` snapshots (see backups) rather than in-place `VACUUM`.

### 3.4 Core schema (per course shard)

```sql
CREATE TABLE case_studies (
  id INTEGER PRIMARY KEY,
  author_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  body_z BLOB NOT NULL,              -- zstd(dict=problem) compressed markdown
  param_spec_z BLOB,                 -- compressed JSON parameter specification
  status TEXT NOT NULL DEFAULT 'draft',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE variants (
  id INTEGER PRIMARY KEY,
  case_study_id INTEGER NOT NULL REFERENCES case_studies(id),
  seed_json_z BLOB NOT NULL,         -- the concrete parameter values used
  body_z BLOB NOT NULL,
  solution_z BLOB NOT NULL,
  verification TEXT NOT NULL,        -- 'verified' | 'flagged' | 'manual'
  model_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE submissions (
  id INTEGER PRIMARY KEY,
  variant_id INTEGER NOT NULL REFERENCES variants(id),
  seat_id INTEGER NOT NULL,          -- references seats in directory.db
  page_count INTEGER NOT NULL,
  storage_prefix TEXT NOT NULL,      -- object storage key prefix for scans
  recognized_z BLOB,                 -- compressed recognized text (all pages)
  recognition_conf REAL,             -- mean confidence 0..1
  status TEXT NOT NULL DEFAULT 'uploaded',
  submitted_at INTEGER NOT NULL
);

-- Full-text index over recognized handwriting and problem text
CREATE VIRTUAL TABLE search_fts USING fts5(
  content, kind, ref_id UNINDEXED, tokenize = 'porter unicode61'
);

CREATE TABLE embeddings (
  ref_kind TEXT NOT NULL,            -- 'variant' | 'submission'
  ref_id INTEGER NOT NULL,
  vec_i8 BLOB NOT NULL,              -- int8 quantized vector
  scale REAL NOT NULL,
  PRIMARY KEY (ref_kind, ref_id)
);
```

Timestamps are integer Unix epoch. All schema changes go through numbered migration files applied per shard by a migration runner at startup; never edit a shard by hand.

### 3.5 Backups and durability

Run Litestream (or an equivalent WAL-shipping process) on every shard for continuous replication to object storage, plus a nightly `VACUUM INTO` snapshot per shard. Restore drills are part of the definition of done for the data layer: an engineer must demonstrate restoring a course shard to a point in time before the feature ships.

## 4. Handwritten solution pipeline

This is the pipeline the product lives or dies on. Treat it as a first-class subsystem with its own tests and quality metrics.

**Stage 1, upload.** The client uploads page images or a PDF directly to object storage via presigned URLs; the API receives only the completed manifest. Enforce limits server-side: max 25 pages, max 15 MB per page, JPEG, PNG, HEIC, or PDF.

**Stage 2, preprocessing (Rust).** For each page: EXIF orientation fix, downscale to a max long edge of 2200 px, deskew via Hough transform, illumination correction, adaptive binarized copy alongside the grayscale copy. Store both renditions. Emit page quality metrics (blur score, skew angle, ink coverage) and reject unreadable pages early with a specific error the frontend can show ("Page 3 is too blurry, retake it").

**Stage 3, handwriting reading.** Do not build a custom HTR model. Send the preprocessed grayscale pages to a vision-capable model (Claude via the Anthropic API) with a strict transcription prompt: transcribe exactly what is written, preserve mathematical notation as LaTeX, mark illegible spans with a placeholder token, and return per-region confidence. Modern vision LLMs outperform classical HTR engines (Tesseract is not acceptable for handwriting) and handle mixed text and mathematics, which is exactly what student solutions contain. Cache results by page content hash so re-uploads and retries are free.

**Stage 4, indexing.** Compress and store the transcription, insert into `search_fts`, embed the transcription for semantic retrieval, and quantize the vector. Retrieval queries combine FTS5 BM25 and vector similarity with reciprocal rank fusion; this hybrid is what makes "find submissions that used the annuity approach" work even when students phrase things differently.

**Stage 5, review surface.** Expose the transcription aligned with page images (store region bounding boxes from Stage 3) so a professor reads the scan with the transcription beside it and low-confidence spans highlighted. Recognized text is assistive; the scan remains the source of truth for grading.

Run stages 2 through 4 in a background worker (arq or a lightweight Redis queue), never in the request path. The student sees "processing" state via polling or SSE within the upload flow.

## 5. PDF problem ingestion

Most professors already have their material as PDFs. This pipeline is how existing problem sets become Tirocinium case studies, and its defining rule is that **the AI proposes and the professor disposes**: extracted content lives in a staging state and never becomes course content, and is never parameterized or shown to students, until the professor has confirmed it.

A second rule sits beside it and is just as absolute: **figures are pixels from the professor's original, always.** Case studies routinely contain diagrams, circuit schematics, process flows, charts, and illustrations, and these are often the substance of the problem. A figure is therefore never redrawn, never regenerated by a model, never replaced with a textual description, and never "cleaned up". It is cropped from the source document at full fidelity and rendered to students exactly as the professor made it. Text extraction is a transcription problem; figures are a preservation problem, and the pipeline treats them as different species end to end.

**Stage 1, upload and decode.** The professor uploads a PDF (max 60 MB, max 200 pages) to object storage via presigned URL. A background worker classifies each page as born-digital or scanned by probing the text layer. Born-digital pages are extracted with `pdfium` bindings in the Rust crate, preserving reading order, and converted to markdown; equations that survive as text are normalized, and equation images are cropped and sent for vision transcription. Scanned pages go through the same Rust preprocessing as student submissions (Stage 2 of section 4) and then to the vision model for full-page transcription to markdown with LaTeX math. Either way the output of this stage is one markdown document per page plus page images, cached by content hash so re-uploads cost nothing.

**Stage 1b, figure extraction (Rust).** Figures are located by two detectors whose union is proposed to the professor. The deterministic detector walks pdfium's page object tree: embedded raster images are extracted losslessly from the PDF stream (no re-encode, no resample), and clusters of vector path objects that form a drawing are identified by spatial grouping and rendered as a region crop at 300 dpi into lossless PNG, with a 2x rendition alongside. The model detector runs during Stage 2: the vision pass also returns bounding boxes for anything figure-like the object walk missed, which matters most on scanned pages, where every figure is by definition a raster crop of the preprocessed page. Each extracted figure gets a content hash, its source page and bounding box, and a nearby-caption guess, and goes to object storage next to the source PDF; SQLite holds only metadata, consistent with section 3.3. The markdown from Stage 1 references figures by token, `![caption](fig://{figure_id})`, at the position they occupied in the source, so document text and figure placement travel together without the figure bytes ever entering a prompt or a text pipeline.

**Stage 2, segmentation.** A second AI pass receives the page markdowns, with page boundaries and figure tokens marked, and returns a structured list of extracted items: `{title, question_md, solution_md, figure_ids, page_span, confidence, notes}`. The prompt is strict about fidelity: reproduce the professor's wording, do not improve or summarize, keep every figure token exactly where it appeared, assign each figure to the item whose text refers to it, flag any question whose solution could not be found, and flag any solution that appears to belong to a different question. Items land in a staging table:

```sql
CREATE TABLE import_jobs (
  id INTEGER PRIMARY KEY,
  course_id INTEGER NOT NULL,
  storage_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing',  -- processing | ready | confirmed | failed
  page_count INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE import_items (
  id INTEGER PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES import_jobs(id),
  question_z BLOB NOT NULL,
  solution_z BLOB,
  page_span TEXT NOT NULL,             -- '3-4'
  confidence REAL NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending'  -- pending | confirmed | discarded | merged
);

CREATE TABLE figures (
  id INTEGER PRIMARY KEY,
  content_hash TEXT NOT NULL UNIQUE,
  storage_key TEXT NOT NULL,           -- lossless original crop
  storage_key_2x TEXT,                 -- high-density rendition
  source TEXT NOT NULL,                -- 'embedded_raster' | 'vector_render' | 'page_crop'
  page INTEGER,
  bbox TEXT,                           -- source-page coordinates, JSON [x,y,w,h]
  width_px INTEGER NOT NULL,
  height_px INTEGER NOT NULL,
  caption TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE item_figures (
  item_id INTEGER NOT NULL REFERENCES import_items(id),
  figure_id INTEGER NOT NULL REFERENCES figures(id),
  role TEXT NOT NULL DEFAULT 'essential',  -- 'essential' | 'decorative'
  PRIMARY KEY (item_id, figure_id)
);
```

The `figures` table is not staging: confirmed case studies keep their rows (re-parented from item to case study at confirmation), figures deduplicate by content hash across imports, and figure bytes live in object storage permanently with the case study's lifecycle.

**Stage 3, professor confirmation.** The API serves each item alongside its source page images and its extracted figures rendered inline at their token positions, so the professor sees the reconstructed problem exactly as students will, figures included, beside the original pages. Figure-specific actions join the card's verbs: adjust a crop's bounds with drag handles (the backend re-crops from the lossless source, never rescales the extraction), reassign a figure to a different item, split a region the detector merged, mark a figure decorative (kept, but excluded from AI context), or add one the detectors missed by drawing a box on the page. Confirming an item copies it into `case_studies` as a draft with its figure references intact; nothing copies automatically. Unconfirmed jobs and their staging rows are purged after 30 days; orphaned staging figures purge with them.

Extraction accuracy is a tracked product metric on both channels: log the edit distance between extracted and confirmed text per item, and log figure interventions per item (crop adjustments, reassignments, manual additions), reviewing the respective detector or prompt whenever either median drifts up.

## 6. Parameterization and variant generation

### 6.1 The parameter specification

A professor authors the base case study in markdown and defines a parameter spec, stored as JSON:

```json
{
  "parameters": {
    "discount_rate": {"type": "number", "range": [0.04, 0.12], "step": 0.005},
    "company_sector": {"type": "choice", "options": ["agri-processing", "logistics", "retail"]},
    "cashflow_years": {"type": "integer", "range": [4, 8]}
  },
  "invariants": [
    "The NPV must be positive in the base scenario",
    "Difficulty must remain equivalent to the original"
  ],
  "solution_method": "Free-text description of the expected solution approach"
}
```

The spec supports typed parameters (number, integer, choice, entity) and professor-written invariants in natural language. Invariants are the professor's control over pedagogical equivalence and are passed verbatim into generation and verification prompts.

Figures introduce one hard constraint here. Variants reproduce a case study's figures byte-for-byte (they reference the same `figures` rows; nothing is ever regenerated), so any value that is visibly printed inside a figure is frozen: a resistor value on a schematic, an axis label on a chart, a flow rate on a process diagram cannot vary, because the diagram would silently contradict the text. During parameterization, each essential figure is checked (one vision call per figure, cached by figure hash) for the text and numbers it displays, and any proposed parameter whose current value appears in a figure is blocked with the reason shown ("4.7 kΩ appears in Figure 2, so it can't vary unless the figure is decorative"). The professor's escape hatches are exactly two: mark the figure decorative, or rewrite the problem text so the value lives in prose rather than in the drawing. Auto-parameterization (6.2) applies the same check to its own proposals before the professor ever sees them, and the verification pass (6.3) receives the essential figures as images so its independent re-solve catches any variant whose text has drifted out of agreement with a diagram; such variants are flagged, never shown.

### 6.2 AI-assisted parameterization

Writing a parameter spec by hand is the steepest part of the authoring curve, so Tirocinium offers automatic parameterization as a first draft. When the professor selects it, one AI call receives the confirmed question and solution and returns a complete proposed spec: which values should vary and why, sensible ranges that keep the problem well-posed (the model must check ranges against the solution, so a discount rate range cannot flip an NPV problem's answer sign unless that is pedagogically intended), choice parameters for entities and framing, drafted invariants, and the inferred solution method. The proposal also annotates the question text with the token positions for each parameter, so the frontend can highlight exactly what would vary.

Rules that keep this safe:

- A proposed spec is always a draft. It renders in the same editor as a hand-written spec, fully editable, and requires an explicit save by the professor. There is no path from auto-parameterization to published variants without professor review.
- The proposal call runs against the confirmed content only, never against unconfirmed import items.
- Proposals are versioned with prompt and model id like everything else in the generation subsystem, and the professor's edits to proposals are logged as a quality signal: heavy editing means the prompt needs work.
- The verification loop in 6.3 applies identically to variants from auto-proposed and hand-written specs; provenance of the spec earns no shortcut.

### 6.3 Generation and verification loop

Generation is a two-model loop, and the verification half is not optional:

1. **Sample** concrete parameter values from the spec (seeded, so a variant is reproducible from its seed).
2. **Generate** the variant body and a full worked solution in one call, with the base case study, the sampled values, and the invariants in context.
3. **Verify** with an independent call: a second pass receives the variant and solution without the first pass's reasoning and must re-solve the problem. Compare final answers programmatically where the solution method yields numeric results (the Rust crate includes a tolerant numeric comparer). Agreement marks the variant `verified`; disagreement marks it `flagged` and it is never shown to students without professor approval.
4. **Store** everything: seed, bodies, both solutions, model id, prompts version. Regeneration after a prompt or model change must be traceable.

Professors get a review queue of flagged variants and can promote, edit, or discard. Pre-generate a pool of verified variants per case study (default 20) asynchronously when the professor publishes, so students never wait on generation.

### 6.4 Cost and safety controls

Cap generation concurrency per course, dedupe by seed, and cache aggressively. Log token usage per course for reporting. Strip any student-identifying information from prompts; only course content goes to the model provider.

### 6.5 The voice defense conversation

After a student submits a handwritten solution, they can enter a spoken Socratic conversation with an AI tutor about their own work. This is the product's signature learning moment (the pedagogy is described in the frontend guide, section 4.2), and it is the most latency-sensitive and cost-sensitive subsystem in the platform, so it gets its own careful design.

**Context assembly.** Each conversation session is constructed from three things the tutor must have: the variant the student solved, the professor's reference solution for that variant, and the transcription of the student's own handwritten submission (from the pipeline in section 4). The variant's essential figures are attached as images, not descriptions, so the tutor sees the same diagram the student worked from and can conduct the conversation about it ("look at the second loop in the figure; where does your equation for it come from?"); the `working_assessment` evidence pass in the mastery model receives them the same way, since judging a solution's method without the diagram it answers to would be judging blind. The system prompt casts the tutor firmly: a warm, curious teaching assistant conducting a defense, never a grader, whose goal is to draw out the student's reasoning through questions, confirm what is sound, gently probe what is not, and finish by naming the one concept most worth revisiting. The reference solution is the tutor's ground truth for correctness; the student transcription is what the conversation is actually about. No student-identifying information beyond the seat context ever enters the prompt.

**The real-time loop.** Voice makes this a streaming pipeline, not a request-response call, and the engineering target is turn latency low enough that the student never feels they are waiting on a machine (aim: first audio response under 800 ms from end of student speech). The chain is: browser captures audio and streams it up over a WebSocket; speech-to-text runs streaming so transcription is ready almost as the student stops talking; the tutor model generates its response with the conversation history and context; text-to-speech streams the reply back as audio chunks that begin playing before the full response is generated. Use a provider that supports streaming speech-to-text and low-latency streaming text-to-speech; keep the turn-taking logic (endpointing, barge-in so a student can interrupt) on the server so behavior is consistent across devices. The tutor model runs with the same Anthropic API used elsewhere; the speech layers are separate services behind a thin interface so they can be swapped as the market moves.

**State and cost.** A conversation is stateful within a session and ephemeral after it: store the final transcript (compressed, like all text) and the tutor's closing concept-to-revisit for the student's history and the professor's insight into class-wide misconceptions, but do not retain raw audio beyond the session unless a student explicitly saves it. Cap conversation length (a soft wind-down prompt as it approaches the cap, since a defense should be focused, not endless), cap concurrent sessions per course, and log token and speech-service usage per course alongside the generation costs from 6.4. Speech services dominate the cost here, so the streaming TTS choice is a real budget decision, not just a latency one.

**Safety and honesty.** The tutor never does the student's thinking for them; its prompt forbids simply revealing the answer when a student is stuck, steering instead toward the next question that helps them find it. It stays strictly within the academic task. And because the whole premise is that the student did the work by hand, the tutor works only from the submitted transcription; it cannot be used as a back door to have the AI solve a fresh problem from scratch.

**Graceful degradation.** If speech services are unavailable or the student's connection is poor, the conversation falls back to typed text without losing the session, and the frontend surfaces this plainly. The typed path preserves the self-explanation benefit even where it loses the articulation-through-speech edge.

### 6.6 The mastery model

Every submission, defense conversation, and professor grade also feeds the mastery model: the per-seat, per-concept algorithm that drives the "shaky to solid" labels, the revisit queue, and the professor's class-wide misconception view. It is fully specified in the companion mastery model specification and only its engineering placement is stated here. The model consumes an immutable `evidence_events` log (one event per mapped concept per submission, conversation, or grade, each carrying a source, score, and confidence) and maintains a cached (mastery, stability, last-seen) state per seat and concept that is always recomputable by replaying the log. The computation lives in the Rust crate as pure functions (`platform_core::mastery`) of event stream and parameter version, which is what makes it property-testable, replayable for parameter fitting, and correctable retroactively. The defense conversation's closing verdict (6.5) must be emitted as the structured rubric JSON defined in the specification, not free text, because it is an evidence source, and the tolerant numeric comparer from 6.3 doubles as the `answer_match` evidence source. Concept definitions and case-to-concept mappings are authored by professors with AI proposals during authoring and PDF import, under the same propose-and-dispose rule as parameterization.

## 7. API design

REST over JSON, versioned under `/api/v1`. Conventions: plural nouns, cursor pagination (`?cursor=`, `?limit=`), RFC 7807 problem details for errors, idempotency keys on all mutating endpoints that the frontend can retry (uploads, generation requests). Representative surface:

```
POST   /api/v1/courses/{id}/seats                 -> generate seats, one-time code download
POST   /api/v1/seats/redeem                       -> code in, course-scoped session out
POST   /api/v1/seats/{id}/revoke
POST   /api/v1/seats/{id}/reissue                 -> new code, history preserved
POST   /api/v1/courses/{id}/case-studies
POST   /api/v1/courses/{id}/imports               -> presigned PDF upload, job created
GET    /api/v1/imports/{id}                       -> job status and extracted items
POST   /api/v1/import-items/{id}/confirm          -> becomes a draft case study
POST   /api/v1/case-studies/{id}/auto-parameterize -> proposed spec, draft only
POST   /api/v1/case-studies/{id}/publish          -> triggers variant pool generation
GET    /api/v1/case-studies/{id}/variants?state=verified
POST   /api/v1/variants/{id}/submissions          -> returns presigned upload URLs
GET    /api/v1/submissions/{id}                   -> status, transcription, confidence
GET    /api/v1/courses/{id}/search?q=...          -> hybrid retrieval
POST   /api/v1/submissions/{id}/conversation      -> open a voice defense session
WS     /api/v1/conversations/{id}/stream           -> bidirectional audio and events
```

### 7.1 Access model: professor accounts, student seat codes

Only professors have accounts. A professor signs up with email (or institutional SSO where available) and creates courses. Students never register, never provide an email, and never exist as identities on the platform. Instead, the professor pre-generates a fixed number of **seats** for a course, downloads the seat codes once, and distributes them to students however they like. The platform stores no student PII at all; the mapping from seat to real student lives offline with the professor. This eliminates our burden of student identity, consent flows, and institutional data agreements, while the professor retains full knowledge of who each seat is.

How it works end to end:

1. **Generation.** `POST /api/v1/courses/{id}/seats {"count": 80}` creates seats numbered `S-001` through `S-080`, each with a randomly generated access code: 16 characters from a Crockford base32 alphabet (no ambiguous characters), grouped for readability, e.g. `MK4T-9RWF-C2HP-X6ZD`. That is roughly 80 bits of entropy, far beyond brute-force reach even with no lockout, but rate limiting applies anyway.
2. **One-time download.** The response includes a signed, short-lived download URL for a CSV (`seat_number, code`) and a print-ready PDF of code cards. Plaintext codes are returned exactly once at generation time; after that the platform holds only hashes. If a professor loses the file, they regenerate codes for the affected seats rather than recovering old ones.
3. **Storage.** Codes are credentials and are treated like passwords: stored as Argon2id hashes in the directory database, never logged, never in error messages. A fast pre-index (first 4 characters stored separately) keeps lookup O(1) without weakening the scheme.
4. **Redemption.** A student enters a code, the API verifies it, and issues a long-lived session token scoped to exactly one course and one seat. The code is reusable across devices for the whole term (students lose phones); revocation is per seat, not per session.
5. **Lifecycle.** Professors can revoke a seat (leaked code), reissue a fresh code for the same seat (submission history is preserved because history hangs off the seat, not the code), add seats later, and see per-seat activity (last active, submission count) labeled only by seat number.

Rate limiting on the redemption endpoint is strict: 10 attempts per IP per hour with exponential backoff, and generic failure messages that do not distinguish "no such code" from "revoked".

Directory database additions:

```sql
CREATE TABLE seats (
  id INTEGER PRIMARY KEY,
  course_id INTEGER NOT NULL,
  seat_number TEXT NOT NULL,          -- 'S-001', displayed everywhere
  code_hash TEXT NOT NULL,            -- Argon2id
  code_prefix TEXT NOT NULL,          -- first 4 chars, lookup index only
  status TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'revoked'
  created_at INTEGER NOT NULL,
  last_used_at INTEGER,
  UNIQUE (course_id, seat_number)
);
CREATE INDEX idx_seats_prefix ON seats(code_prefix);
```

In the per-course shards, `submissions.student_id` becomes `seat_id`, and every student-facing record references the seat. Nothing in a shard, in logs, or in prompts sent to the AI provider ever contains anything about the student beyond their seat number.

Sessions are short-lived JWTs for professors and opaque server-side tokens for seats (revocable instantly when a seat is revoked). Roles reduce to professor, seat, and admin. Authorization checks live in one dependency layer in FastAPI; a seat can only ever read its own submissions and its own course, and enforcement of that rule has dedicated tests.

## 8. Engineering conventions

- **Repository layout**: monorepo with `apps/api` (Python), `crates/platform_core` (Rust), `apps/web` (frontend, covered in the companion guide), shared `openapi.json` generated from FastAPI and consumed by the frontend for typed clients.
- **Python**: ruff and mypy in strict mode, pydantic v2 models at every boundary, no raw dicts crossing module boundaries.
- **Rust**: clippy pedantic, criterion benchmarks committed for every public function in the crate, benchmarks run in CI with regression thresholds.
- **Testing**: pytest with a fixture that builds a realistic course shard (50 case studies, 500 submissions) used by all data-layer tests; golden-file tests for the preprocessing pipeline with a corpus of 30 real scan photos of varying quality; contract tests generated from the OpenAPI spec.
- **Observability**: structured JSON logs, OpenTelemetry traces across the Python and Rust boundary, and four dashboards from day one: API latency, queue depth, recognition confidence distribution, and variant verification pass rate. The last two are product health metrics, not just infrastructure metrics.

## 9. Build order

1. Directory and shard infrastructure, migrations, backup and restore drill.
2. Professor auth, courses, seat generation with code download and revocation, case study CRUD.
3. Upload pipeline through preprocessing, with quality rejection.
4. Handwriting reading, indexing, hybrid retrieval.
5. PDF import: decode, segmentation, confirmation staging.
6. Parameter spec authoring, auto-parameterization proposals, generation and verification loop, variant pool.
7. Voice defense conversation: context assembly, streaming loop, transcript storage, cost controls.
8. Professor review surfaces, reporting, hardening, load testing against the p95 budgets in section 2.

Each phase ends with the restore drill still passing and the latency budgets still holding. Do not start a phase with the previous one's dashboards red.
