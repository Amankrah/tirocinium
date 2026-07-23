# Handoff: the transcription-read endpoint for the upload preview

From the frontend session to the backend session. Phase 3.5's upload flow is
built and its journeys are green (skip-gated); the one piece that cannot be built
honestly on the frontend is the transcription preview beside the thumbnails
(frontend guide 4.1, step 4: "the transcription preview beside thumbnails. Low
confidence spans are highlighted"). It needs a read endpoint that today does not
exist: `GET /api/v1/submissions/{id}` returns status, `page_count`, and
`recognition_conf`, but not the recognized markdown or the per-region spans. All
the data is already produced and stored by the 3.3 pipeline; this asks only that
it be exposed, seat-scoped, to the seat that owns the submission.

## What the preview renders, and therefore what it needs

For each page of a processed submission, the frontend shows the cleaned page
image with the transcribed text beside it, aligns the two, and highlights the
low-confidence spans over the image. So, per page, it needs: the image the
bounding boxes are normalised against, the page's markdown, and the regions.

`Region` already has exactly the right shape (`app/transcription/model.py`):
`bbox` is `(x, y, w, h)` top-left origin normalised to 0..1, `confidence` is
0..1, and `text` is the span text. The markdown carries LaTeX maths and the
`[[illegible]]` token for spans the model could not read; the frontend renders it
with the same react-markdown + KaTeX path as the problem body, and draws a
visible marker for the illegible token.

## Proposed contract

A sub-resource, so the list-shaped `GET /submissions/{id}` stays light:

    GET /api/v1/submissions/{submission_id}/transcription

Seat-scoped exactly like every submission surface: the owning seat reads it, and
anyone else (another seat, a professor JWT) gets a 404, never a distinguishable
403. Shape:

    {
      "submission_id": int,
      "status": "pending" | "uploaded" | "processing"
                | "processed" | "needs_retake" | "failed",
      "recognition_conf": float | null,
      "pages": [
        {
          "page_index": int,
          "quality_status": "ok" | "rejected" | null,
          "reject_reason": "blurry" | "too_dark" | "blank" | null,
          "confidence": float | null,
          "image_url": string | null,
          "markdown": string | null,
          "regions": [
            { "bbox": [float, float, float, float], "confidence": float, "text": string }
          ]
        }
      ]
    }

- `image_url` is a short-lived presigned GET for the grayscale rendition
  (`{prefix}/pre/{page_index}.grayscale.png`), because that is the image the
  `bbox` coordinates are normalised against, and presigning keeps the bytes off
  the API just as the upload path does. A page that has not been preprocessed yet
  (or was rejected) has `image_url: null`.
- `markdown` and `regions` come from the page's `page_transcriptions` row; a page
  not yet transcribed has `markdown: null`, `regions: []`.
- `reject_reason` lets the preview say why a page needs a retake, reusing the
  same reason vocabulary the SSE `rejected` event already carries.

The frontend only needs per-page markdown, not the combined
`submissions.recognized_z`, because the preview aligns each page's text to its
own image; no need to expose the combined blob here.

## The one thing that needs a backend decision

`page_transcriptions` is keyed by the server-computed content hash (the sha256 of
the fetched page bytes), but `submission_pages` does not store that hash, so there
is currently no join from a page to its transcription. Resolving that is a
backend data-model call, and there is more than one reasonable way (store the
computed content hash on `submission_pages` during `_record_page` and join on it;
or write the markdown and regions onto the page row directly). Please pick and
record it; the frontend does not depend on which, only on the contract above.

## Constraints this must not break

The rendition is the seat's own handwriting, so presigning it is fine and there
is no PII beyond seat context; nothing about the seat beyond its submission goes
into the response. This is not a figure, so the figures-are-pixels rule does not
bear on it, but do serve the stored rendition as-is rather than re-rendering it,
so the boxes still line up. The endpoint reads only; it changes no state.

## When it lands

Tell the frontend session the final path and the resolved page-to-transcription
link. The frontend will add a typed client call and the preview component
(image with overlaid low-confidence boxes beside the markdown), wire it into the
upload panel's processed state, and extend journey two to assert the preview
renders. Regenerate the contract seam (`export_openapi.py` then
`pnpm generate:client`) as part of landing it, so `schema.ts` carries the new
types. If you record this as a decision, take the next free number and let the
frontend session know; this handoff is intentionally unnumbered.
