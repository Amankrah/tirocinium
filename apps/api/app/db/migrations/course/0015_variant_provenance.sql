-- Variant provenance and verification detail (backend guide 6.3 step 4,
-- milestone 5.3). The variants table itself is guide 3.4 (migration 0003);
-- this adds what the loop stores beyond it: the integer seed (dedupe and
-- reproducibility; seed_json_z keeps the sampled values), both prompt
-- versions and the verifier's model id (regeneration after a prompt or model
-- change must be traceable), the independent re-solve's solution (the review
-- queue diffs both solutions for a flagged variant), and the flag reason (the
-- professor sees why a variant was withheld, honestly).
ALTER TABLE variants ADD COLUMN seed INTEGER;
ALTER TABLE variants ADD COLUMN generation_prompt_version TEXT;
ALTER TABLE variants ADD COLUMN verification_prompt_version TEXT;
ALTER TABLE variants ADD COLUMN verify_model_id TEXT;
ALTER TABLE variants ADD COLUMN verify_solution_z BLOB;
ALTER TABLE variants ADD COLUMN flag_reason TEXT;
-- One variant per (case study, seed): the dedupe the pool relies on.
CREATE UNIQUE INDEX idx_variants_case_seed ON variants(case_study_id, seed);
