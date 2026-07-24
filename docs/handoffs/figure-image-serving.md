# Handoff (addendum): figure and source-page image serving

From the frontend session to the backend session. The 4.4 confirm endpoint and
the figure verbs (`from-box`, role, delete) and the 4.5 metrics all landed and
are green, thank you. One thing from the original confirmation-contract handoff
did not, and it is the part the surface is actually built around: the pixels.
The confirmation read (`GET .../imports/{id}/items`) returns items carrying only
`figure_ids: number[]`, with no page list and no figure metadata, and every
figure verb returns just a `figure_id`. So the frontend has ids but no image to
show and no source page to draw on, which means the figure review, the crux of
the surface (frontend guide 4.3: "figures rendered inline at their extracted
positions", "diagrams are where that trust is won or lost"), cannot be built.

This is cross-cutting, not just a 4.4 concern: there is no figure-image endpoint
anywhere, so the reading surface's `fig://` resolver (decision 0014) also still
has nothing real to resolve. Adding figure serving unblocks both surfaces.

## What the confirmation read needs to also return

Per item, the figures themselves, not just their ids:

    "figures": [
      {
        "figure_id": int,
        "token": str,            // the fig://{id} sitting in question_md
        "role": "essential" | "decorative",
        "source": "embedded_raster" | "vector_render" | "page_crop",
        "image_url": str,        // presigned GET of the lossless crop (storage_key)
        "width_px": int,
        "height_px": int,
        "page": int | null,
        "bbox": [float, float, float, float] | null,  // page points, top-left
        "caption": str | null
      }
    ]

and the source pages, for the left pane and the draw-a-box / re-crop canvas:

    "pages": [
      { "page_index": int, "image_url": str, "width_pt": float, "height_pt": float }
    ]

`figures[].image_url` and `pages[].image_url` are short-lived presigned GETs of
the professor's own source, exactly like the seat CSV/PDF and the submission
rendition, so presigning is the established pattern and no bytes touch the API.
`pages[].width_pt`/`height_pt` let the frontend map a figure `bbox` (page points)
onto the displayed page and, for draw-a-box, map a drawn rectangle back to page
points to send to `from-box`. If page rasters are not already stored from decode,
rendering them for this read is fine (they are already produced during decode).

The `from-box` response should also carry the created figure's `image_url` (and
`width_px`/`height_px`), so the surface can render the new crop immediately
without a refetch; today it returns only `figure_id`.

## Two smaller gaps, lower priority

- **Solution editing.** `ConfirmIn` accepts `question_md` but not `solution_md`,
  so the surface can let a professor fix a misread question but not a misread
  solution. If solution edits are meant to be supported (the guide's card has
  both panes editable), add `solution_md` to `ConfirmIn`.
- **Merge / split / discard.** The guide's verb set includes merging a
  question the segmenter split, splitting one it joined, and discarding a
  spurious item. None have endpoints yet. These are real but secondary to the
  figure review; flag whether they are planned so the frontend knows whether to
  design the card's action set around them now or later.

## What the frontend does with this

With figure and page serving, the confirmation surface becomes the specified
one: source pages left, editable text right, figures inline at their tokens (the
existing resolver), the figure verbs on hover (draw-a-box on the page, role,
remove, and re-crop once a crop endpoint exists), low-confidence-first, the
`N of M confirmed` progress line and j/k model, and Playwright journey four. It
also lets the reading surface finally render real ingested figures. Regenerate
the seam when it lands and tell us the final shapes.
