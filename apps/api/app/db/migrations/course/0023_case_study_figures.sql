-- A figure's link straight to the case study that carries it (decision 0077).
--
-- Until now the only route from a figure to a case study went through the
-- import pipeline: figure -> item_figures -> confirmed import_item ->
-- case_studies. That is the right chain for imported content and the only
-- chain that existed, which meant a case study whose body carried a fig://
-- token but which never came from an import had no route at all. Its figures
-- were invisible to a seat (the resolve's published-only check walks that
-- chain and found nothing) and absent from the tutor's context and the
-- figure-frozen check (load_essential_figures walks it too).
--
-- A course pack is the first content to arrive that way, but it is not the
-- only content that can: a case study authored in the UI with a fig:// token
-- has the same shape. So this is the general link rather than a pack-specific
-- one, and both routes are unioned wherever essential figures are read.
--
-- `role` mirrors item_figures: 'decorative' keeps the figure on the page and
-- excludes it from AI context, which is the professor's escape hatch from the
-- figure-frozen check and must mean the same thing on either route.
CREATE TABLE case_study_figures (
  case_study_id INTEGER NOT NULL REFERENCES case_studies(id),
  figure_id INTEGER NOT NULL REFERENCES figures(id),
  role TEXT NOT NULL DEFAULT 'essential',
  PRIMARY KEY (case_study_id, figure_id)
);
CREATE INDEX idx_case_study_figures_figure ON case_study_figures(figure_id);
