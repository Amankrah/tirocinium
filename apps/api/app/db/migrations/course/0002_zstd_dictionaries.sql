-- Per-content-type zstd dictionaries (backend guide 3.3, milestone 1.2):
-- trained on the course's own corpus, stored in the shard so a shard file
-- stays self-contained (a course archive is one file copy). One active
-- dictionary per content type; retraining replaces it, and frames
-- self-describe their dictionary so older plain-compressed blobs stay
-- readable.
CREATE TABLE zstd_dictionaries (
  id INTEGER PRIMARY KEY,
  content_type TEXT NOT NULL UNIQUE
    CHECK (content_type IN ('problem_text', 'handwriting')),
  dict BLOB NOT NULL,
  trained_at INTEGER NOT NULL
);
