# 0031 — The figure verbs: decorative, reassign, add-a-box (re-crop and split deferred)

Date: 2026-07-24. Phase 4, milestone 4.4 (the figure verbs). Author: backend
engineer (Claude).

**Three of the confirmation surface's figure verbs are built as course-nested,
professor-and-owner endpoints: mark a figure decorative, reassign it between
items, and add one the detectors missed by drawing a box (a raster crop of the
page). The remaining two, drag re-crop and split, need re-cropping from the
lossless source per figure kind and are deferred with their design recorded.**
The verbs mutate the `item_figures` link and the content-addressed `figures`
table, never a student surface. `PUT /courses/{id}/import-items/{item}/figures/
{figure}` assigns a figure to an item and sets its role (`essential` or
`decorative`; decorative keeps the figure but excludes it from AI context, the
guide's mark); reassigning is that PUT on the new item plus `DELETE` on the old,
which keeps the two operations RESTful and idempotent without a bespoke move
verb. `POST .../figures/from-box` is the draw-a-box verb: it looks up the page's
stored raster, crops it at the normalised box with `platform_core.pdf.crop_figures`
(the same pure-image crop the vision detector uses, so a manual add is a raster
crop of the page exactly like an automatic `page_crop`, never a re-render or a
description), stores it content-addressed, and assigns it to the item.

Re-crop (drag the handles to adjust a figure's bounds) and split (break a region
the detector merged) both hinge on re-cropping from the lossless source, and the
guide is explicit that the backend must re-crop from that source and never
rescale the extraction. What the source is depends on the figure's kind: a
`page_crop` re-crops from the page raster (the same path `from-box` already
uses), a `vector_render` must re-render its region from the PDF at 300 dpi (the
crate's `render_region`, which needs the source PDF, not the stored crop), and an
`embedded_raster` re-crops the embedded image itself. That per-kind source
handling is real work and is the kind of thing the five-PDF corpus is there to
validate (a re-crop that silently rescaled would pass a synthetic test but fail a
real diagram), so it is a focused follow-up rather than rushed here. The three
verbs shipped now cover the common corrections (a mislabeled decorative, a figure
on the wrong item, a missed figure); re-crop and split refine an existing crop's
bounds and can land against the corpus. This is the last major Phase 4 backend
piece bar those two and the corpus itself.
