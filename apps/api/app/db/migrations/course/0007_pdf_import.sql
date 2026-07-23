-- PDF import: decode stage (backend guide section 5 Stage 1, milestone 4.1).
-- A professor uploads a PDF; a worker decodes each page to markdown (born
-- digital via pdfium, scanned via the Phase 3 preprocess and vision path) and
-- caches the reading by content hash. Figure extraction (4.2), segmentation
-- into import_items (4.3), and the figures tables land in later migrations;
-- 4.1 adds only what decode needs. Imports live in the course shard and nest
-- under the course in the API (decision 0013): per-shard ids collide across
-- courses, so a flat /imports/{id} could not find the shard.

-- One import job per uploaded PDF. course_id is carried per the guide's schema
-- even though the shard is already the course. Status vocabulary the decode
-- path drives: pending (created, awaiting the PDF) -> uploaded (PDF in place,
-- enqueued) -> processing -> ready | failed. 'confirmed' arrives with the
-- confirmation surface (4.4).
CREATE TABLE import_jobs (
  id INTEGER PRIMARY KEY,
  course_id INTEGER NOT NULL,
  storage_key TEXT NOT NULL,          -- source PDF in object storage (imports bucket)
  status TEXT NOT NULL DEFAULT 'pending',
  page_count INTEGER,
  created_at INTEGER NOT NULL
);

-- Per-page decode cache, keyed by the server-computed sha256 of the rendered
-- page image bytes (never a client-declared hash), so re-uploading the same
-- page, even in another job, costs no decode or model call. markdown_z is the
-- page markdown compressed under the problem_text dictionary; decoder is the
-- provenance every generated artifact records (the pdfium version for born
-- digital, the model id and prompt version for scanned).
CREATE TABLE page_documents (
  content_hash TEXT PRIMARY KEY,
  kind TEXT NOT NULL,                 -- 'born_digital' | 'scanned'
  markdown_z BLOB NOT NULL,
  decoder TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- One row per page of a job: its kind, where the rendered page raster landed
-- in object storage (for the confirmation surface and, on scanned pages, the
-- figure crops), and which cached document it resolved to.
CREATE TABLE import_pages (
  job_id INTEGER NOT NULL REFERENCES import_jobs(id),
  page_index INTEGER NOT NULL,        -- 0-based
  kind TEXT NOT NULL,
  image_key TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  PRIMARY KEY (job_id, page_index)
);
CREATE INDEX idx_import_pages_job ON import_pages(job_id);

-- Idempotency ledger for the retryable import-create call (API conventions),
-- the twin of idempotency_keys (migration 0004) pointing at import_jobs. When a
-- third target needs one, generalize the two into one target-agnostic ledger.
CREATE TABLE import_idempotency_keys (
  key TEXT NOT NULL,
  scope TEXT NOT NULL,
  import_id INTEGER NOT NULL REFERENCES import_jobs(id),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (key, scope)
);
