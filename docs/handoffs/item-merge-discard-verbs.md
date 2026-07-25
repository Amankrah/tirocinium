# Handoff back: item merge and discard verbs have landed

From the backend session to the frontend session. The confirmation card's last
two item verbs are in (decision 0034), so the action set can now be wired whole:
confirm, edit-then-confirm, merge, and discard all exist; only split stays
deferred (it needs re-cropping from the lossless source and waits on the five-PDF
corpus). The seam is regenerated (`schema.ts` is committed and `pnpm typecheck`
is green), and the full backend gate is green. Shapes below.

## Merge

`POST /api/v1/courses/{course_id}/import-items/{item_id}/merge`

`item_id` is the **survivor** (the card that stays). The body names the sibling to
fold into it:

    { "source_item_id": int }

For "merge with the next item", call it on the earlier card with the next card's
id as `source_item_id`; the source's text is appended after the survivor's.

Returns `200` with the survivor's new state:

    {
      "survivor_id": int,
      "merged_item_id": int,        // now gone from the review
      "question_md": str,           // survivor + source, fig:// tokens intact
      "solution_md": str | null,    // combined the same way
      "page_span": str,             // e.g. "3, 4" when the two differed
      "confidence": float           // the lower of the two
    }

What it does server-side: appends the source's question and solution markdown,
moves the source's figures onto the survivor (the survivor's role wins if both
carried the same figure, and the link dedups), combines page span and notes, sets
confidence to the min, and retires the source to `state = "merged"`. The figures
themselves are untouched (no re-crop). After a merge, refetch the items read to
get the survivor's updated `figures[]`; the returned body carries the text fields
so you can update the card's panes immediately without waiting on the refetch.

**Retry safety.** Merge is not idempotent by content, but it is safe to retry: a
second call with the same `source_item_id` finds the source no longer `pending`
and returns `409`, so a double-submit can never append the text twice. Treat that
`409` as "already merged", not as an error to surface loudly.

Error shapes (all RFC 7807 problem+json):
- `400` merging an item into itself (`source_item_id == item_id`).
- `404` survivor or source not found.
- `409` either item is not `pending` (already confirmed, discarded, or merged), or
  the two belong to different imports.

## Discard

`POST /api/v1/courses/{course_id}/import-items/{item_id}/discard`

No body. Returns `204`. Flips the item to `state = "discarded"`; it is a state
edit, not a delete (the row stays for the 30-day purge and the accuracy metrics).

- Idempotent: discarding an already-discarded item is another `204`.
- `409` on a confirmed item (unpublish or delete the draft instead).
- `404` if the item does not exist.

The copy the guide specifies still holds: "Confirmed problems become drafts in
your course. The rest are discarded after 30 days." A discard here is the manual
version of that same fate.

## What changed in the items read

`GET /courses/{id}/imports/{import_id}/items` now **omits** items in state
`discarded` or `merged`; it still returns `pending` and `confirmed`. So after a
merge or discard the removed card simply disappears from the list on the next
fetch, and your "N of M confirmed" denominator (pending + confirmed) is already
correct without client-side filtering. Confirm also refuses a discarded or merged
item (`409`), which you should not normally hit since neither appears in the list.

## Still deferred: split

Split (break a question the segmenter joined, or a figure region the detector
merged) is the one remaining verb. It needs re-cropping from the lossless source
per figure kind (decision 0031), which the five-PDF corpus is there to validate,
so it lands after the corpus PDFs are captured. Design the card's action set with
a split affordance if you like, but it will 404 until then; wire confirm, edit,
merge, and discard now.
