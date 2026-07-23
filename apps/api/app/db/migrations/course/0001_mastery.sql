-- The mastery tables (mastery spec sections 2 and 3), identical to
-- mastery_store.SCHEMA; test_course_migration_covers_store_schema pins the
-- two against drift. The rest of the course schema (case_studies, variants,
-- submissions, search, figures) lands with its phases.
CREATE TABLE IF NOT EXISTS concepts (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  position INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS case_study_concepts (
  case_study_id INTEGER NOT NULL,
  concept_id INTEGER NOT NULL REFERENCES concepts(id),
  weight REAL NOT NULL CHECK (weight > 0 AND weight <= 1),
  PRIMARY KEY (case_study_id, concept_id)
);

CREATE TABLE IF NOT EXISTS evidence_events (
  id INTEGER PRIMARY KEY,
  seat_id INTEGER NOT NULL,
  concept_id INTEGER NOT NULL REFERENCES concepts(id),
  source TEXT NOT NULL CHECK (source IN
    ('professor_grade','answer_match','defense_rubric','working_assessment')),
  score REAL NOT NULL CHECK (score >= 0 AND score <= 1),
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  k REAL NOT NULL CHECK (k > 0 AND k <= 1),
  ref_kind TEXT NOT NULL CHECK (ref_kind IN ('submission','conversation','grade')),
  ref_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_evidence_seat_concept
  ON evidence_events(seat_id, concept_id, created_at);
CREATE INDEX IF NOT EXISTS idx_evidence_ref
  ON evidence_events(ref_kind, ref_id);

CREATE TABLE IF NOT EXISTS mastery_state (
  seat_id INTEGER NOT NULL,
  concept_id INTEGER NOT NULL REFERENCES concepts(id),
  state_json TEXT NOT NULL,          -- opaque cache; Rust core owns the shape
  params_version TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (seat_id, concept_id)
);
