# 0021 — Phase 4.1: PDF decode, with pdfium behind a seam

Date: 2026-07-23. Phase 4, milestone 4.1. Author: backend engineer (Claude).

**The decode path is built and tested against a `PdfDecoder` seam whose real
pdfium implementation is deferred to a focused follow-up, so the import upload
handshake, the decode worker orchestration, and the page-document cache land
green now without the native library.** The guide (section 5 Stage 1) mandates
pdfium for born-digital extraction and 4.2's figure work depends on its object
tree, so the decoder choice is not open; but provisioning the pdfium native
binary on this Windows host and in CI is real infrastructure work, and the
sequencing was a genuine fork. Decision (with the project owner): the Python
scaffolding first. `PdfDecoder.decode(pdf_bytes) -> list[DecodedPage]`
(`app/imports/decoder.py`) has a `PdfiumDecoder` that raises `NotImplementedError`
until the `platform_core` PDF member lands, and a `FakePdfDecoder` the tests
drive with canned pages. Decode is deterministic CPU work, not a model call, so
the real path is Rust, not a recorded response; the seam exists only so the
orchestration is testable before the native dependency is in place.

The import upload mirrors the submission handshake (milestone 3.1): `POST
/api/v1/courses/{id}/imports` creates a pending job and hands back a presigned
PUT for the PDF (60 MiB ceiling enforced on the declared manifest), `POST
.../imports/{id}/complete` flips pending to uploaded and enqueues decode exactly
on the transition, and `GET .../imports/{id}` reports status. Imports nest under
the course, extending decision 0013 for the same reason: per-shard import ids
collide across courses, so a flat `/imports/{id}` could not find the shard, and
an import in another course's shard is simply a 404. The whole surface is
professor-and-owner through `ensure_course_owner` (students never import), and
create is idempotent through `import_idempotency_keys`, a twin of the submission
ledger pointing at `import_jobs` (when a third target needs one, the two
generalize into a single target-agnostic ledger). The 200-page ceiling is
enforced at decode, not upload, because the page count is only known after
pdfium opens the file.

The decode worker (`app/imports/pipeline.py`, migration course/0007) fetches the
PDF, decodes each page, stores its rendered raster in a new imports bucket, and
records one markdown document per page cached in `page_documents` by the
server-computed sha256 of the raster (never a client hash), so a re-upload of
the same page, even across jobs, costs no decode or model call. Born-digital
pages carry their pdfium text; scanned pages reuse the Phase 3.2 preprocess and
the 3.3 vision seam, read by a new versioned prompt
(`prompts/pdf-page-transcription/v1`) that transcribes printed text and,
crucially, never describes or captions a figure (figures are preserved as pixels
and extracted separately in 4.2). A page that preprocessing rejects (blank, or a
full-page figure) decodes to empty text rather than failing the job.
Milestone 4.1 stops at decoded, cached page markdown; figure extraction (4.2),
segmentation into `import_items` (4.3), and the confirmation surface (4.4) build
on these rows. `import_jobs.course_id` is kept as the guide's schema writes it,
though the shard is already the course, matching how the core schema was landed
verbatim.
