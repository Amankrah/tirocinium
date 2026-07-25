-- Auto-parameterization proposals (backend guide 6.2, milestone 5.2). A
-- proposal is a draft the professor edits and explicitly saves through the
-- param-spec PUT; it is never itself the case study's spec. The row stores the
-- full response payload (compressed JSON: draft spec, annotations, frozen
-- values, provenance) so an idempotent retry replays the identical response,
-- plus provenance like every generated artifact. The edit columns fill in when
-- the professor first saves a spec afterwards: how much of the proposal
-- survived is the prompt-quality signal (heavy editing means the prompt needs
-- work), destined for the Phase 8 dashboards alongside the 4.5 metrics.
CREATE TABLE spec_proposals (
  id INTEGER PRIMARY KEY,
  case_study_id INTEGER NOT NULL REFERENCES case_studies(id),
  payload_z BLOB NOT NULL,             -- zstd(dict=problem_text) response JSON
  model_id TEXT NOT NULL,              -- provenance: the proposal model
  prompt_version TEXT NOT NULL,        -- provenance: the proposal prompt
  idempotency_key TEXT UNIQUE,         -- retry dedupe for the generation call
  created_at INTEGER NOT NULL,
  -- The prompt-quality signal, logged at the professor's first save after
  -- this proposal (guide 6.2: edits to proposals are a quality signal).
  saved_at INTEGER,
  parameters_kept INTEGER,
  parameters_changed INTEGER,
  parameters_dropped INTEGER,
  parameters_added INTEGER,
  invariants_edit_distance INTEGER
);
CREATE INDEX idx_spec_proposals_case ON spec_proposals(case_study_id);
