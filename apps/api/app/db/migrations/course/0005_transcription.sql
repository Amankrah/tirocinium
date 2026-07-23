-- Transcription cache and per-page processing state (backend guide section 4
-- Stages 2 to 3, milestone 3.3). The worker preprocesses each uploaded page,
-- reads it with a vision model, and caches the reading so retries and
-- re-uploads cost nothing. Renditions and scans live in object storage; the
-- shard holds only keys, metrics, and the recognized text (the aggregate lands
-- in submissions.recognized_z, already in the core schema).

-- One row per distinct page content, keyed by the sha256 the worker computes
-- over the fetched original bytes. That server-side hash is the trustworthy
-- cache key (the client-declared content_hash on submission_pages is a hint,
-- not to be trusted). markdown_z is the transcription compressed under the
-- 'handwriting' dictionary; regions_json carries the bounding boxes and
-- per-region confidence the review surface highlights (Stage 5); model_id and
-- prompt_version are the provenance every generated artifact records.
CREATE TABLE page_transcriptions (
  content_hash TEXT PRIMARY KEY,
  markdown_z BLOB NOT NULL,
  confidence REAL NOT NULL,
  regions_json TEXT NOT NULL,
  model_id TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- Per-page processing state the worker fills: where the two preprocessing
-- renditions (grayscale for the model, binarized alongside) landed in object
-- storage, the quality metrics the Rust crate emitted as JSON, and the quality
-- verdict ('ok', or a rejection with the reason code the frontend shows).
ALTER TABLE submission_pages ADD COLUMN grayscale_key TEXT;
ALTER TABLE submission_pages ADD COLUMN binarized_key TEXT;
ALTER TABLE submission_pages ADD COLUMN metrics_json TEXT;
ALTER TABLE submission_pages ADD COLUMN quality_status TEXT;
ALTER TABLE submission_pages ADD COLUMN reject_reason TEXT;
