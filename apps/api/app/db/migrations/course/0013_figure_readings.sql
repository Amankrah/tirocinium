-- Cached per-figure vision readings for the figure-frozen check (backend guide
-- 6.1, milestone 5.1). A figure's displayed values (numbers with units, labels,
-- axis text) are read once per distinct figure, ever: keyed by the figure's
-- content hash, so a figure shared across imports or courses' items is read a
-- single time and every later parameterization pass hits the cache. values_json
-- is a small JSON array of display strings (not prose, so it stays plain TEXT
-- rather than a dictionary-compressed blob); model_id and prompt_version are
-- the reading's provenance, like every generated artifact carries.
CREATE TABLE figure_readings (
  content_hash TEXT PRIMARY KEY,
  values_json TEXT NOT NULL,
  model_id TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
