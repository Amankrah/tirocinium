-- The professor grading action (milestone 6.2). The grade itself lives on the
-- submission for the review surfaces; its effect on mastery flows through
-- evidence_events as professor_grade rows (ref_kind 'grade', confidence 1.0),
-- which supersede the submission's automatic events on replay (mastery spec
-- 4.6). Score is the spec's [0,1] mapping of whatever scale the professor
-- grades in; the mapping happens at the API boundary.
ALTER TABLE submissions ADD COLUMN grade REAL;
ALTER TABLE submissions ADD COLUMN graded_at INTEGER;
