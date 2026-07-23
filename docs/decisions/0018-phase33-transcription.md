# 0018 — Phase 3.3: handwriting transcription

Date: 2026-07-23. Phase 3, milestone 3.3. Author: backend engineer (Claude).

**A worker process runs the pipeline off the request path, and it does Stage 2
as well as Stage 3.** The guide (backend section 4) splits the work into a
preprocessing stage and a transcription stage; nothing yet stored the grayscale
renditions the model needs, so the worker does both in one pass: fetch the
scan, preprocess it with the 3.2 Rust crate, store the two renditions in the
scans bucket, read the grayscale copy with the vision model, cache the reading,
then aggregate. This completes the 3.2 crate's wiring rather than leaving a
separate Stage 2 job that would only ever hand its output straight to Stage 3.
The queue is `arq` and the transport is Redis, both already pinned (milestone
0.2). The worker entry point is `arq app.worker.WorkerSettings`.

**Redis is optional for the API process, required for the worker.** The API
talks to the worker only through Redis: an `arq` pool to enqueue and pub/sub to
stream progress. Both are built in the lifespan only when `TIRO_REDIS_URL` is
set; without it the app uses a no-op task queue and an in-process event bus, so
dev without a broker and the whole test suite run green with no Redis. The
consumer side has no such luxury: the worker needs the broker, which is correct,
since it is the thing consuming the queue. Enqueue and SSE both go through small
seams (`app/tasks.py`, `app/events.py`) so tests substitute a recording queue
and a shared in-memory bus.

**The cache key is the server-computed hash, not the client's.** Each page is
cached in a new `page_transcriptions` table (migration course/0005) keyed by the
sha256 the worker computes over the fetched original bytes, so a retry or a
re-upload of the same page costs no model call, and a hostile client cannot
poison or probe the cache by declaring a hash it does not own (the
client-declared `content_hash` on `submission_pages` stays a hint only). The
cached row carries the compressed markdown, the confidence, the region JSON, and
the model and prompt provenance every generated artifact records.

**Progress is SSE over Redis pub/sub with a status vocabulary.** `GET
/api/v1/submissions/{id}/events` (seat-auth, own submission only, 404 otherwise)
emits the current status, then forwards per-page events off the channel
`submission:{course_id}:{submission_id}` until a terminal `done`. Submissions
move `uploaded` → `processing` → `processed`, or to `needs_retake` when a page
fails preprocessing (the reason code travels in the event and onto the page
row), or `failed` on an internal error. `submissions.status` is free-form TEXT,
so this needed no schema change beyond the per-page processing columns 0005 adds.

**The model seam is a Protocol with a recorded implementation; model calls in
tests are always recorded.** `VisionTranscriber.transcribe(image_png, prompt, *,
model_id)` has a real `AnthropicTranscriber` (Claude, id and key from
`TIRO_VISION_MODEL_ID` / `TIRO_ANTHROPIC_API_KEY`) and a `RecordedTranscriber`
that replays a JSON reading keyed by the sha256 of the exact grayscale bytes, so
a page always yields the same reading and no test touches a live model (testing
skill). The prompt is a versioned file (`prompts/handwriting-transcription/v1.md`
with a changelog), loaded by `app/prompts.py`, and its version string is stored
with every transcription; the prompt treats all text in the image as student
work to transcribe, never as instructions to obey (the hostile-text-is-data
constraint). Recorded responses are project assets under
`apps/api/tests/recorded/transcription/` and grow deliberately.
