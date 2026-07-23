-- Submission upload tracking (backend guide section 4 Stage 1, milestone
-- 3.1). The submissions table itself (core schema, migration 0003) is left
-- untouched: it already carries page_count, storage_prefix, status, and the
-- recognition columns the later pipeline fills. These two tables add the
-- per-page manifest and the idempotency ledger the upload handshake needs.

-- One row per uploaded page, in reading order. storage_key is the object
-- storage location the client PUTs to via a presigned URL; content_hash (the
-- client-declared sha256) becomes the transcription cache key in 3.3. Scans
-- themselves live in object storage, never in SQLite (backend guide 3.3).
CREATE TABLE submission_pages (
  submission_id INTEGER NOT NULL REFERENCES submissions(id),
  page_index INTEGER NOT NULL,            -- 0-based order within the submission
  storage_key TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  content_hash TEXT,                       -- client-declared; caching key (3.3)
  PRIMARY KEY (submission_id, page_index)
);

-- Idempotency ledger for retryable mutating calls (API conventions, backend
-- guide section 7). A key is scoped to an operation so the same client key
-- cannot cross-wire two different endpoints; it points at the row the first
-- call created, so a retry returns that row instead of duplicating work.
CREATE TABLE idempotency_keys (
  key TEXT NOT NULL,
  scope TEXT NOT NULL,                      -- operation name, e.g. 'create_submission'
  submission_id INTEGER NOT NULL REFERENCES submissions(id),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (key, scope)
);
