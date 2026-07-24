# 0029 — Phase 4.4: the confirm endpoint

Date: 2026-07-24. Phase 4, milestone 4.4 (backend). Author: backend engineer
(Claude).

**Confirming a staged item copies its question into `case_studies` as a draft
with its fig:// tokens intact, marks the item `confirmed` and links it, and
flips its import job to `confirmed` so the item and its figures survive the
30-day purge. Nothing copies automatically; confirmation is the professor's
explicit act.** This is the guide's Stage 3, the backend half of the 4.4
confirmation surface (the card layout, keyboard model, and figure verbs are the
frontend's). `POST /api/v1/courses/{id}/import-items/{item_id}/confirm` (nested
under the course per decision 0013, professor-and-owner through
`ensure_course_owner`) creates a draft case study whose body is the item's
question markdown, exactly as segmentation produced it, so the `fig://` tokens
travel into the draft and resolve to the same figure rows. It is idempotent: a
second confirm returns the same draft rather than making another. A companion
`GET .../imports/{import_id}/items` returns the staged items (question and
solution markdown, figure assignments, confidence, the model's notes, state) so
the confirmation surface has something to show; `case_study_id` on `import_items`
(migration course/0011) records the link.

Two design points. First, the confirmed item is kept, not deleted, in state
`confirmed`: it still holds the solution markdown, which the case study body does
not (case studies carry the problem, not a worked solution, until the variant
pool of Phase 5), and Phase 5's independent re-solve and verification will want
it. Only the draft is ever student-facing; the item stays in staging as
provenance. Second, confirmation flips the whole import job to `confirmed`. The
30-day purge keys on job status, so without this a stale job would be purged out
from under a confirmed item, orphaning its figures. Flipping the job on the first
confirmation keeps the job, its confirmed item, and the figures the item
references (whose `item_figures` rows are therefore never orphaned). A job with a
mix of confirmed and still-pending items is kept whole; the pending remainder is
harmless staging and the professor may confirm more later.

The rest of 4.4's backend, the figure verbs the confirmation surface drives (drag
re-crop from the lossless source, reassign a figure to another item, mark one
decorative, draw a box for one the detectors missed), is a separate slice and is
not built here. Confirmation copies the figure references as they stand.
