# 0030 — Phase 4.5: the two extraction-accuracy metrics

Date: 2026-07-24. Phase 4, milestone 4.5. Author: backend engineer (Claude).

**Two accuracy metrics are logged per item at confirmation: the text edit
distance between what segmentation extracted and what the professor confirmed,
and the number of figure interventions the professor made. Both land in
`import_item_metrics`, one row per item, so the median of each can be watched and
the detector or prompt reviewed when it drifts up.** The guide (section 5 Stage
3) makes extraction accuracy a tracked product metric on both channels, text and
figures, and this is where the numbers are captured; the Phase 8 health
dashboards read them. The metrics are known at the moment of confirmation, so the
confirm endpoint is where they are computed: it now takes an optional body
(`question_md`, the professor's edited text, and `figure_interventions`, a count
the confirmation surface reports). The confirmed text (the edit, or the
extraction unchanged) becomes the draft's body, and `text_edit_distance` is the
Levenshtein distance between the original extracted question and that confirmed
text, so a large value means the model needed heavy correction. The response
returns the distance, and re-confirming returns the same logged value.

Edit distance is a plain Python function (`app/imports/metrics.py`), not Rust.
Confirmation is a professor action off the request hot path, and the
mandated-Rust code is specifically the numeric comparer, the mastery arithmetic,
and preprocessing (decision 0001 and the model-call rules), not a one-off
character-level distance over a page of text; a compact two-row dynamic program
is clear and fast enough here. `import_item_metrics` (migration course/0012) keys
on `item_id` and is written at confirmation and updated on re-confirmation, so a
row always reflects the latest confirmed state of its item.

The figure-interventions count is supplied by the confirmation surface rather
than derived server-side, because the figure verbs (drag re-crop, reassign,
decorative, draw-a-box) that constitute an intervention are not built yet and, in
any case, are a frontend interaction the surface is best placed to count. When
those verb endpoints land they can feed the same column; for now the surface
reports the total at confirmation, which is what the metric needs. This closes
the backend of Phase 4: decode, figure extraction, segmentation, the confirm
endpoint, and now the accuracy metrics. The remaining Phase 4 work is the figure
verbs' own endpoints and the confirmation surface itself, which is the frontend's,
plus the five-PDF golden corpus that gates the phase and does not exist yet.
