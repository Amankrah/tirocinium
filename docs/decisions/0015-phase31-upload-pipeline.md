# 0015 — Phase 3.1: the submission upload path

Date: 2026-07-23. Phase 3, milestone 3.1. Author: backend engineer (Claude).

**Submissions are a seat-only surface for now, keyed off the seat's own
course.** A seat token already carries exactly one course, so the upload
endpoints take no course in the path and pick the shard from the identity; a
seat reads and completes only its own submissions, and another seat's row is a
404, not a 403, so existence never leaks (backend 7.1). This sidesteps the
colliding-id problem that decision 0013 records for flat routes without a
directory registry: `POST /api/v1/variants/{id}/submissions`,
`POST /api/v1/submissions/{id}/complete`, and `GET /api/v1/submissions/{id}`
are unambiguous because the shard is the caller's course. Professor review of
submissions is a Phase 8.1 surface and will nest under the course like the rest
of the authoring model; it is deliberately not added here.

**The upload is a two-call handshake and the API never sees the bytes.** The
create call declares a manifest of pages, the server validates it and returns
presigned PUT URLs into the scans bucket (a per-submission `scans/{course}/{uuid}`
prefix, one key per page), the client uploads straight to object storage, then
the complete call flips the submission from `pending` to `uploaded` for the
preprocessing worker (milestone 3.2). Limits are enforced on the declared
manifest: 1 to 25 pages, at most 15 MiB per page, content types JPEG, PNG,
HEIC, or PDF (backend guide section 4 Stage 1). A limit breach is a 422 through
the normal pydantic path, rendered as problem+json. Binding the size ceiling at
the storage layer as well (a presigned POST content-length-range condition, or
a bucket policy) is left to the Phase 9 hardening pass; the manifest ceiling is
the server-side enforcement this milestone commits to, and the object keys are
server-chosen so a client cannot write outside its prefix.

**Idempotency is a per-operation ledger in the shard.** Migration
`course/0004` adds `submission_pages` (the per-page manifest, whose
`content_hash` becomes the transcription cache key in 3.3) and
`idempotency_keys` (`(key, scope)` to `submission_id`). The create call, which
allocates rows and issues URLs, honors an `Idempotency-Key` header: a retry
with the same key returns the original submission with freshly minted URLs
rather than a duplicate. The complete call needs no ledger, being a naturally
idempotent state transition. The existing `submissions` columns (core schema,
migration 0003) are left untouched so the realistic fixture shard stays valid;
the new work lives entirely in the two added tables.
