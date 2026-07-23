# 0023 — The submission transcription read, and the page-to-reading join

Date: 2026-07-23. Phase 3, Stage 5 review data (unblocking the frontend's 3.5
transcription preview). Author: backend engineer (Claude).

**The recognized reading of a submission is served by a dedicated sub-resource,
`GET /api/v1/submissions/{id}/transcription`, and a new
`submission_pages.content_sha` column links each page to its cached reading so
the per-page regions can be joined.** The frontend's upload flow wants to show
the transcription beside the page thumbnails once processing finishes, but `GET
/submissions/{id}` returned only status and page metadata, and there was no way
to reach the per-page regions at all: the transcription pipeline (3.3) caches
each page's reading in `page_transcriptions` keyed by the server-computed sha256
of the fetched original bytes, but that hash was never stored on the page row
(`submission_pages.content_hash` holds the client-declared hash, a hint that is
deliberately not trusted as a key), so nothing joined a submission's pages to
their readings. Migration course/0008 adds `content_sha`, the trustworthy
server hash, which the worker now writes when it records a processed page
(replacing an unused `confidence` argument on that write path); the read joins
`submission_pages.content_sha` to `page_transcriptions.content_hash`.

The read is a sub-resource rather than more fields on `GET /submissions/{id}`,
so the base submission stays lean and the heavier review payload (aggregate
markdown, and per page the markdown, mean confidence, quality status, and region
boxes) is fetched only when the preview needs it. It is a seat surface
(`require_seat`, own submission only, a 404 otherwise), consistent with every
other submission endpoint: the recognized text is the student's own handwriting,
never a solution, so returning it to the seat reveals no answer, and the
no-answers and own-rows-only constraints both hold. A page not yet processed
simply has no `content_sha`, so its markdown comes back empty and its regions
absent, and the whole response is empty-but-well-formed before the worker runs.
The professor-facing review surface (Phase 8.1) can add its own variant later;
this serves the student preview the frontend is building now.
