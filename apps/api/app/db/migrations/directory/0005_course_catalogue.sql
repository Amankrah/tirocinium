-- Which materials catalogue a course quotes against (milestone 10.1, decision
-- 0062).
--
-- The catalogue itself is not here and is not in any shard. It is a versioned
-- file asset under apps/api/catalogue/{id}/vN.json, loaded the way prompts are,
-- because it is read-only platform content that no professor edits: the
-- per-course authoring verb is a shortlist of lines per case study, which lives
-- in the course shard where the case study does.
--
-- What the directory holds is the pin. A course names a catalogue and a version
-- and stays on it, so publishing v2 never moves a running course's prices under
-- its students mid-term. Null means the course does not quote at all, which is
-- every course that existed before this migration.
ALTER TABLE courses ADD COLUMN catalogue_id TEXT;
ALTER TABLE courses ADD COLUMN catalogue_version INTEGER;
