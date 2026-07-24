-- PDF import: segmentation staging (backend guide section 5 Stage 2, milestone
-- 4.3). A second AI pass reads the decoded page markdowns and returns extracted
-- items (question/solution pairs with figure assignments); they land here as
-- 'pending' and become case studies only when the professor confirms them (4.4).
-- The AI proposes and the professor disposes: nothing here is student-visible.
--
-- import_items follows the guide's schema, with two additions the guide's
-- representative block omits but the model returns and the confirmation surface
-- needs: title and notes (the model's fidelity flags, e.g. a solution that could
-- not be found or that looks like it belongs to another question). Recorded as a
-- deliberate extension.
CREATE TABLE import_items (
  id INTEGER PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES import_jobs(id),
  title TEXT,
  question_z BLOB NOT NULL,            -- zstd(dict=problem_text) question markdown
  solution_z BLOB,                     -- compressed solution markdown, if found
  page_span TEXT NOT NULL,             -- e.g. '3-4'
  confidence REAL NOT NULL,
  notes TEXT,                          -- the model's fidelity flags
  model_id TEXT NOT NULL,              -- provenance: the segmentation model
  prompt_version TEXT NOT NULL,        -- provenance: the segmentation prompt
  state TEXT NOT NULL DEFAULT 'pending' -- pending | confirmed | discarded | merged
);
CREATE INDEX idx_import_items_job ON import_items(job_id);

-- Which figures an item uses, and whether each is essential (in AI context) or
-- decorative (kept, but excluded from AI context; the professor marks this in
-- 4.4). Figures are content-addressed and outlive the job (migration 0009), so
-- this is the staging link that a confirmed item re-parents to a case study.
CREATE TABLE item_figures (
  item_id INTEGER NOT NULL REFERENCES import_items(id),
  figure_id INTEGER NOT NULL REFERENCES figures(id),
  role TEXT NOT NULL DEFAULT 'essential', -- 'essential' | 'decorative'
  PRIMARY KEY (item_id, figure_id)
);
