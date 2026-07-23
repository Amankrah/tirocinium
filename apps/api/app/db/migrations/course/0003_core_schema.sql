-- The core course-shard schema, verbatim from backend guide 3.4. Landed in
-- 1.5 because the phase gate's latency check needs the realistic fixture
-- shard (50 case studies, 500 submissions); Phase 2 and 3 build the CRUD
-- and pipelines on top. submissions.seat_id references seats in
-- directory.db (cross-shard by id, never by SQL join).
CREATE TABLE case_studies (
  id INTEGER PRIMARY KEY,
  author_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  body_z BLOB NOT NULL,              -- zstd(dict=problem_text) compressed markdown
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
CREATE INDEX idx_submissions_seat ON submissions(seat_id, submitted_at);
CREATE INDEX idx_submissions_variant ON submissions(variant_id);

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
