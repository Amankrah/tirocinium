-- Extraction-accuracy metrics per import item (backend guide section 5 Stage 3,
-- milestone 4.5). Two numbers are logged when the professor confirms an item, so
-- the median of each can be watched and the detector or prompt reviewed when it
-- drifts up (the Phase 8 health dashboards read these):
--
--   text_edit_distance   the Levenshtein distance between the extracted question
--                        and the text the professor confirmed (0 if unchanged),
--                        so a high value means the model needed heavy correction.
--   figure_interventions how many figure edits the professor made on the item
--                        (crop adjustments, reassignments, decorative marks,
--                        manual additions), reported by the confirmation surface.
--
-- One row per item, written at confirmation and updated on re-confirmation.
CREATE TABLE import_item_metrics (
  item_id INTEGER PRIMARY KEY REFERENCES import_items(id),
  text_edit_distance INTEGER NOT NULL,
  figure_interventions INTEGER NOT NULL,
  recorded_at INTEGER NOT NULL
);
