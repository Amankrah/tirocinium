# Handoff back: figure and source-page image serving has landed

From the backend session to the frontend session, answering
`figure-image-serving.md`. The pixels are served. The seam is regenerated
(`apps/api/openapi.json` and `apps/web/src/lib/api/schema.ts` are both committed
and `pnpm typecheck` is green), the full backend gate is green (176 Python tests,
ruff, mypy), and decision 0032 records the shapes. Final shapes below.

## The confirmation read now carries figures and pages

`GET /api/v1/courses/{course_id}/imports/{import_id}/items` returns:

    {
      "items": [
        {
          "id": int,
          "title": str | null,
          "question_md": str,          // fig:// tokens intact
          "solution_md": str | null,
          "page_span": str,
          "confidence": float,
          "notes": str | null,
          "state": str,
          "case_study_id": int | null,
          "figures": [
            {
              "figure_id": int,
              "token": str,             // "fig://{id}", the one sitting in question_md
              "role": "essential" | "decorative",
              "source": "embedded_raster" | "vector_render" | "page_crop",
              "image_url": str,         // presigned GET of the lossless crop
              "image_url_2x": str | null, // present for vector renders
              "width_px": int,
              "height_px": int,
              "page": int | null,
              "bbox": [float, float, float, float] | null,  // SEE below: 0..1, not points
              "caption": str | null
            }
          ]
        }
      ],
      "pages": [
        { "page_index": int, "image_url": str }
      ]
    }

`figure_ids` is gone; it is `figures[]` now. `image_url` and `pages[].image_url`
are short-lived presigned GETs (15 min) of the professor's own crop and page
rasters, no bytes through the API.

## One change from what the handoff asked: bbox is normalised 0..1

The handoff asked for `bbox` in page points plus `pages[].width_pt/height_pt` so
you could map points onto the displayed page. I did the opposite and I think it
is what you actually want: **`bbox` is now `[x, y, w, h]` as fractions of the page
(0..1, top-left origin)**, the same frame for all three figure sources. So:

- To place a figure on a displayed page, multiply its `bbox` by the page image's
  rendered width/height. No page dimensions needed from the API.
- For draw-a-box, divide the drawn rectangle by the page image's rendered size to
  get a 0..1 box and send that to `from-box` (which already takes a normalised
  box). Round-trips cleanly.

That is why `pages[]` carries only `{page_index, image_url}` and no `width_pt`/
`height_pt`: with a normalised bbox they are not needed. The old born-digital
(points) vs page_crop (pixels) split in the column is gone; everything is 0..1
(decision 0032). If you have a concrete case where you still need the raw page
dimensions, say so and I will add them, but I do not think you do.

## from-box returns the crop now

`POST .../import-items/{item_id}/figures/from-box` now returns
`{figure_id, image_url, width_px, height_px}`, so you render the new crop
immediately, no refetch. Its request body is unchanged (`{page_index, bbox}` with
bbox normalised 0..1).

## The figure resolver both surfaces needed

New: `GET /api/v1/courses/{course_id}/figures/{figure_id}` returns
`{figure_id, source, image_url, image_url_2x, width_px, height_px}`. This is what
the reading surface's `fig://` resolver (decision 0014) resolves against, and it
also serves any figure to the confirmation surface. Gating:

- A professor who owns the course resolves any figure in it (drafts included).
- A seat resolves a figure only when a published case study carries it; an
  unpublished or unknown figure is an identical 404, so a figure's existence never
  leaks to a student. Same visibility rule as the case study body it sits in.

So the reading surface can now render real ingested figures: for each `fig://{id}`
in a published case study body, call this endpoint and use `image_url`.

## Solution editing is in

`ConfirmIn` now takes `solution_md` (optional) alongside `question_md`. A provided
solution is saved back onto the item, so the card's solution pane can be editable.

## Still deferred (say the word if you need them sooner)

Merge, split, and discard have no endpoints yet. Split and re-crop need per-kind
re-cropping from the lossless source (decision 0031); merge and discard are link
and state edits. They are the last confirmation-surface verbs. Design your card's
action set expecting them, but they are a later slice; the figure review itself
(inline figures, role, remove, draw-a-box, low-confidence-first) is fully served
now.
