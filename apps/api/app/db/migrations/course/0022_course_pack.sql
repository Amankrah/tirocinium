-- The course pack's identity map (decision 0077). A pack is a versioned file
-- asset under apps/api/coursepack/{id}/vN.json, the way a prompt and a
-- catalogue are, and loading it is idempotent: this table is what makes the
-- second load an update rather than a duplicate.
--
-- The key is the pack's own stable item key (`l1-q1-palladium-radius`), never
-- a title, because a professor may retitle a question and that must not orphan
-- the row it already produced. pack_version records which revision last wrote
-- the item, so a reload from v2 can be told from one that never ran.
--
-- It is deliberately a side table rather than a column on case_studies: a case
-- study authored in the UI has no pack and should carry no pack column, and a
-- pack item that is later deleted from the pack leaves the case study standing
-- (the professor's content outlives the asset that seeded it).
CREATE TABLE course_pack_items (
  pack_id TEXT NOT NULL,
  item_key TEXT NOT NULL,
  case_study_id INTEGER NOT NULL REFERENCES case_studies(id),
  variant_id INTEGER REFERENCES variants(id),
  pack_version INTEGER NOT NULL,
  loaded_at INTEGER NOT NULL,
  PRIMARY KEY (pack_id, item_key)
);
CREATE INDEX idx_course_pack_case ON course_pack_items(case_study_id);
