# 0032 — Figure and source-page image serving, and one normalised bbox frame

Date: 2026-07-24. Phase 4, milestone 4.4 (follow-up: the pixels the confirmation
and reading surfaces are built around). Author: backend engineer (Claude).

**Figures and their source pages are served as short-lived presigned GET URLs of
the professor's own bytes, never through the API, and a figure's `bbox` is stored
normalised to 0..1 of its page so a client places it or draws a new box on it with
no page-dimension plumbing.** The confirmation read
(`GET /courses/{id}/imports/{import_id}/items`) previously returned each item's
`figure_ids` and nothing else, so the frontend had ids but no image to render and
no page to draw on, which is precisely the review the surface exists for (frontend
guide 4.3: diagrams are where trust is won or lost). It now returns, per item, a
`figures[]` of `{figure_id, token, role, source, image_url, image_url_2x, width_px,
height_px, page, bbox, caption}`, and per job a `pages[]` of `{page_index,
image_url}`. `image_url`/`image_url_2x` and `pages[].image_url` are presigned GETs
of the crop and page rasters already produced during decode, the same pattern as
the seat CSV/PDF and the submission rendition, so no figure bytes ever pass through
a request handler. `from-box` now returns the created crop's `image_url` and pixel
dimensions too, so a manual add renders immediately without a refetch.

The handoff asked for `pages[].width_pt/height_pt` so the client could map a figure
bbox (then stored in page points) onto the displayed page and a drawn rectangle back
to points. Normalising bbox to 0..1 removes that need entirely and fixes a latent
inconsistency: born-digital figures carried bbox in page points, `page_crop` figures
in pixels, so the same column meant two different things and no single client formula
worked. Storing every bbox as `[x, y, w, h]` in fractions of the page (top-left
origin) makes it one frame across all three sources: the client multiplies by the
displayed page size to place a figure and divides a drawn rectangle by it to send to
`from-box` (which already takes a normalised box), so pages need only their image, not
their dimensions. Normalisation happens once at storage (`normalized_bbox` in
`app/imports/figures.py`), so the born-digital, vector, and page_crop paths and the
draw-a-box verb all converge on the same units; existing pre-0032 rows are the only
ones left in mixed units and there are none in any shipped shard.

Serving is one endpoint, `GET /courses/{id}/figures/{figure_id}`, shared by both
surfaces (it is what the reading surface's `fig://` resolver, decision 0014, resolves
against). A professor who owns the course resolves any figure in it, drafts included;
a seat scoped to the course resolves a figure only when a published case study carries
it, walking figure to `item_figures` to a confirmed `import_item` to a published
`case_study`, and an unpublished or absent figure is an identical 404 so a figure's
existence never leaks to a student. That is the same visibility rule as the case study
body the figure sits in (`ensure_course_reader`), applied to the figure it references.
The solution-editing gap in the same handoff is closed here too: `ConfirmIn` now
accepts `solution_md`, saved back onto the item's `solution_z`, since the card's
solution pane is editable alongside the question. Merge, split, and discard remain the
one open verb set (split re-crops from the lossless source per decision 0031; merge and
discard are link and state edits) and are deferred with 0031's re-crop follow-up.
