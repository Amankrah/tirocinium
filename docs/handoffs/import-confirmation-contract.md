# Handoff: the import confirmation contract (staged items, figure verbs, confirm)

From the frontend session to the backend session. Phase 4.2 (figure extraction)
and 4.3 (segmentation into staged `import_items` with `item_figures` and
content-addressed `figures`) are in and the pipeline produces everything the
confirmation surface needs. What is missing is the API for it: the only import
endpoints are still create, complete, and get, so the frontend can drive an
import to "ready" but cannot read a single staged item, adjust a figure, or
confirm anything. This specifies the read, the verbs, and the confirm that
milestone 4.4's surface (frontend guide 4.3, "the heart of the flow") needs.
Per our own rule the frontend cannot hand-write these server types, so the
surface is genuinely blocked until they are generated into `schema.ts`.

The surface this feeds: each staged item is a card with the original PDF pages
on the left and the extracted question and solution as editable markdown on the
right, figures rendered inline at their positions, low-confidence items sorted
to the top, a `14 of 22 confirmed` progress line, and a j/k keyboard model. The
figure verbs (re-crop from the lossless source, reassign, decorative, draw-a-box)
are where professor trust is won, so their fidelity matters most.

## The inviolable constraints this contract must hold

- **Figures are pixels from the original.** Every crop the surface shows and
  every re-crop or draw-a-box the professor makes is produced server-side from
  the lossless source (the embedded raster kept byte for byte, or the page
  rendered at 300 dpi), never redrawn or re-encoded lossily. The frontend only
  ever sends coordinates (a bbox in page points); it never manipulates pixels.
- **The AI proposes, the professor disposes.** Nothing here is student-visible.
  Confirm is the only path from staging to a draft, and it copies, re-parenting
  figures to the new case study; the staging rows stay until the 30-day purge.
- **Figure bytes never enter a text prompt.** Not relevant to these read/verb
  endpoints (no model calls), but the confirmed draft must carry `fig://` tokens,
  not inline image data, so the existing reading-surface rule keeps holding.

## 1. Read: the staged items for an import

    GET /api/v1/courses/{course_id}/imports/{import_id}/items

Professor-and-owner (the same `ensure_course_owner` gate the other import routes
use). Returns the pending items with everything a card needs, plus the source
pages for the left pane and the draw-a-box canvas:

    {
      "import_id": int,
      "status": "ready" | ...,          // only "ready" has items worth showing
      "pages": [
        { "page": int, "image_url": str, "width_pt": float, "height_pt": float }
      ],
      "items": [
        {
          "id": int,
          "title": str | null,
          "question_markdown": str,      // decompressed; carries fig:// tokens
          "solution_markdown": str | null,
          "page_span": str,             // "3-4"
          "confidence": float,
          "notes": str | null,          // the model's fidelity flags, shown quietly
          "state": "pending" | "confirmed" | "discarded" | "merged",
          "figures": [
            {
              "figure_id": int,
              "token": str,             // the fig://{id} that sits in the markdown
              "role": "essential" | "decorative",
              "source": "embedded_raster" | "vector_render" | "page_crop",
              "image_url": str,         // presigned GET of the lossless crop (or 2x)
              "width_px": int,
              "height_px": int,
              "page": int | null,
              "bbox": [float, float, float, float] | null,  // page points, top-left
              "caption": str | null
            }
          ]
        }
      ]
    }

- `pages[].image_url` is a presigned GET of the page rendered at a display
  resolution, with `width_pt`/`height_pt` so the frontend can map a figure's
  `bbox` (page points) onto the displayed image and, for draw-a-box, map a drawn
  rectangle back to page points. If page rasters are not already stored from
  decode, rendering them on demand for this read is fine; they are the
  professor's own source, so presigning is not a concern.
- `figures[].image_url` is the crop the card renders inline at its token; the
  `token` is how the frontend places it in the markdown (the existing fig://
  resolver, decision 0014, already renders these at their position).
- Sort or let the frontend sort by `confidence` ascending; either is fine, say
  which.

## 2. Item verbs

Each mutates staging only and returns the updated item (or the affected items),
so the surface can reflect the change without a refetch. Idempotency keys where a
retry could duplicate.

- `PATCH  .../items/{item_id}` — edit `title`, `question_markdown`,
  `solution_markdown` (edit-then-confirm). Body carries the fields that changed.
- `POST   .../items/{item_id}/merge` — merge with the next item (or a given
  `{ "target_id": int }`) for a question the segmenter split; the surviving item
  gets the concatenated markdown and the union of figures, the other becomes
  `merged`. Return both.
- `POST   .../items/{item_id}/split` — split one item into two at a marker the
  body carries (a character offset, or the boundary the frontend computes).
- `POST   .../items/{item_id}/discard` — set `discarded`.

## 3. Figure verbs

These are where "figures are pixels" is enforced, all server-side crops:

- `POST   .../items/{item_id}/figures` (draw-a-box) — body
  `{ "page": int, "bbox": [x,y,w,h] }` in page points; the server crops that
  region from the page's lossless raster at full density, content-addresses it
  into `figures`, links it to the item, and returns the new figure (with its
  `token` and `image_url`) so the frontend can drop the token into the markdown.
- `PATCH  .../items/{item_id}/figures/{figure_id}/crop` (re-crop) — body a new
  `bbox`; because `figures` is content-addressed and shared, a re-crop produces a
  new figure from the lossless source and repoints this item's `item_figures`
  link, leaving other items' use of the old figure untouched. Return the new
  figure and the token to swap in the markdown.
- `PATCH  .../items/{item_id}/figures/{figure_id}` — set `role`
  (essential/decorative) or `reassign` to another item (`{ "target_item_id": int }`).
  Decorative keeps the figure but the confirmed draft excludes it from AI context
  (the `role` already models this); reassign moves the `item_figures` link.

The frontend never sends pixels for any of these; it sends a page index and a
bbox, and gets back a figure row. That is what keeps the crop lossless.

## 4. Confirm

    POST /api/v1/courses/{course_id}/imports/{import_id}/confirm

Body `{ "item_ids": [int] }` (or confirm per item at `.../items/{id}/confirm`;
per-item is friendlier to the surface's incremental `14 of 22` flow, so that is
the preference). For each confirmed item: create a draft case study in the course
from its markdown, re-parent its essential-and-decorative figures onto the new
case study (new figure links, the `fig://` tokens already in the body resolving
to them), and set the item `confirmed`. Return the created case study ids so the
surface can link straight to the draft in the editor. The 30-day purge already
handles the unconfirmed remainder; confirm must not touch it.

## What the frontend builds when this lands

The confirmation surface: the card layout (source pages left, editable question
and solution right, figures inline at their tokens via the existing resolver),
low-confidence-first ordering, the full verb set with the j/k keyboard model and
`a`/`e` to confirm or edit (matching the review queue the guide specifies), the
figure verbs as a quiet on-hover set (drag-handle re-crop mapping to the crop
endpoint, reassign, decorative, draw-a-box on the source page), the
`N of M confirmed` progress line, and Playwright journey four (import, adjust one
crop, merge two items, confirm, and see the draft render with its figures in the
problem view). The regenerated `schema.ts` gives us the types; we will add the
typed client calls and the surface against them.

## Notes

Regenerate the contract seam (`export_openapi.py`, then `pnpm generate:client`)
when these land, and tell the frontend session the final paths and the couple of
decisions flagged above (page-raster availability, item vs batch confirm, sort
responsibility). If you record this as a decision, take the next free number and
let us know; this handoff is intentionally unnumbered.
