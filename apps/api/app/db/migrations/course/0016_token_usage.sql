-- Per-course token accounting (backend guide 6.4, milestone 5.4). One row per
-- model call made on this course's behalf, in the course's own shard (so
-- "per course" is structural, like everything else). kind names the caller
-- ('variant_generation', 'variant_verification', more as later phases log
-- theirs); the counts come from the provider's usage block and are zero for
-- recorded test replays. The generation budget check and the Phase 8 cost
-- reporting both read this table.
CREATE TABLE token_usage (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,
  model_id TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_token_usage_created ON token_usage(created_at);
