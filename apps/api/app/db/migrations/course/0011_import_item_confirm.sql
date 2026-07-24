-- Confirmation link (backend guide section 5 Stage 3, milestone 4.4). Confirming
-- a staged item copies it into case_studies as a draft; case_study_id records
-- that re-parenting on the item, so the item is not re-confirmed (idempotent)
-- and its figures stay alive: a confirmed item keeps its item_figures rows, so
-- the 30-day purge never treats those figures as orphaned. The item itself is
-- kept (state 'confirmed') because it also holds the solution the variant
-- verification will need in Phase 5; only the confirmed draft is student-facing.
ALTER TABLE import_items ADD COLUMN case_study_id INTEGER REFERENCES case_studies(id);
