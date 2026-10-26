-- Project challenges and the selections students commit to them (decision
-- 0112). A challenge is a requirements statement a professor sets for a
-- material-selection project; the catalogue's own briefs are the seeded
-- library and never live here. A selection is a student's committed candidate
-- set, their weighting, the scored matrix and the quotation they priced, kept
-- together as one artifact, because the justification is what a report is
-- marked on and a defence presses on. The quotation inside is a snapshot at
-- list prices: the project marketplace stores no quotation of its own
-- (decision 0100), and this is the one place a project price is kept, frozen
-- with the selection it belongs to.
CREATE TABLE challenges (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  context TEXT NOT NULL,
  requirements_json TEXT NOT NULL,
  constraints_json TEXT NOT NULL,
  deliverable TEXT NOT NULL,
  weights_json TEXT NOT NULL,
  candidate_families TEXT NOT NULL DEFAULT '',
  shortlist_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE challenge_selections (
  id INTEGER PRIMARY KEY,
  seat_id INTEGER NOT NULL,
  challenge_key TEXT NOT NULL,
  reference TEXT NOT NULL,
  candidates_json TEXT NOT NULL,
  weights_json TEXT NOT NULL,
  matrix_json_z BLOB NOT NULL,
  basket_json TEXT NOT NULL,
  quote_json_z BLOB NOT NULL,
  committed_at INTEGER NOT NULL,
  first_committed_at INTEGER NOT NULL,
  UNIQUE (seat_id, challenge_key)
);

-- A submission may cite a selection on the terms of migrations 0020 and 0021:
-- checked inside the creating transaction, never trusted, null when none.
ALTER TABLE submissions ADD COLUMN selection_id INTEGER REFERENCES challenge_selections(id);

-- The course pack's identity map for challenges, beside course_pack_items for
-- questions: keyed on the pack's stable key so a reload updates in place.
CREATE TABLE course_pack_challenges (
  pack_id TEXT NOT NULL,
  item_key TEXT NOT NULL,
  challenge_id INTEGER NOT NULL REFERENCES challenges(id),
  pack_version INTEGER NOT NULL,
  loaded_at INTEGER NOT NULL,
  PRIMARY KEY (pack_id, item_key)
);
