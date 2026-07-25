# 0034 — The item verbs: merge and discard (split stays deferred)

Date: 2026-07-24. Phase 4, milestone 4.4 (the confirmation surface's last item
verbs). Author: backend engineer (Claude).

**Merge and discard are built as course-nested, professor-and-owner endpoints on
the staged item, as pure link-and-state edits (no figure re-cropped, no bytes
changed, decision 0032); item split stays deferred with the figure re-crop
follow-up (decision 0031) because it alone needs re-cropping from the lossless
source.** `POST /courses/{id}/import-items/{item_id}/merge` takes a
`source_item_id` and folds that sibling into this survivor, for a single question
the segmenter split (frontend guide 4.3, "merge with the next item"): the source's
question markdown is appended after the survivor's (fig:// tokens intact), its
solution likewise, its figures move onto the survivor (`INSERT OR IGNORE ... SELECT`
so the survivor's own role wins a clash and the `(item_id, figure_id)` link dedups),
the page span and the model's notes combine, the confidence becomes the least
confident of the two, and the source is retired to `state = 'merged'`. Confidence
takes the minimum because a merged item is only as trustworthy as its weakest half;
page span joins as `"3, 4"` when the two differ, honest free text the professor
sees. `POST .../{item_id}/discard` flips a spurious item to `state = 'discarded'`,
a state edit and not a delete, so the row survives for the 30-day purge and its
metrics; it is idempotent on an already-discarded item.

Three invariants fall out. First, both `merged` and `discarded` items leave the
review: `list_import_items` now filters `state NOT IN ('discarded', 'merged')`,
keeping pending and confirmed so the surface's "N of M confirmed" still counts the
right denominator; a merged item's content now lives inside its survivor and a
discarded one is rejected, so neither should show as a card. Second, confirm
refuses a discarded or merged item (409) rather than minting a case study from
garbage, closing the hole that the item-state guards open. Third, merge needs no
idempotency ledger: because a successful merge retires the source to `merged` and
both participants must be `pending`, a double-submit finds the source no longer
pending and 409s, so a retry can never append the same text twice; this is the
same natural-idempotency reasoning confirm uses (its `confirmed` guard) rather than
the header-and-ledger path reserved for calls that are not self-guarding. No
migration is needed: `import_items.state` was always an unconstrained TEXT whose
comment already reserved `discarded` and `merged`. Discard deliberately does not
flip `import_jobs.status` (that is confirm's move, to spare a job from purge); a
discarded item stays purgeable. This leaves item/figure split as the only open
Phase 4 backend verb, bundled with the per-kind re-crop from the lossless source
that the five-PDF corpus (decision 0033) is there to validate.
