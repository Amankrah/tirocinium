# 0026 — Student solution input modes: photo, exported PDF, on-platform pen

Date: 2026-07-24. Phase 4 (recorded mid-phase; implementation scheduled).
Author: backend engineer (Claude), from a product requirement.

**A student may submit a solution three ways: a photo of paper (built), a PDF
exported from tablet handwriting (a gap to close in the submission pipeline),
or writing directly on the platform with a pen on a touchscreen (new, frontend
led). This records the three modes and their design; only the design is decided
here, the implementations are scheduled.** The motivation is to lean away from
paper: some students would rather write on an iPad and export, or write straight
into the platform on a tablet or phone, than photograph a sheet. None of this
changes the identity model: a submission is still a seat's, with no student PII.

Mode A, a photo of paper, is the built path (Phase 3): the seat uploads page
images, which are preprocessed and read by the vision handwriting model.

Mode B, an exported handwriting PDF, is within the specification but not yet
implemented. The upload already accepts `application/pdf` (backend guide section
4 Stage 1 lists it), but the transcription pipeline preprocesses every page's
bytes as a camera image with no content-type branch, so a PDF submission is
accepted at upload and then fails at transcription. The gap is closed by
decoding a PDF page to a raster before preprocessing: in the submission pipeline,
a page whose content type is `application/pdf` is rendered to page images with
`platform_core.pdf` (the decode member built in 4.1), and each rendered page
flows through the existing preprocess and vision handwriting read. A handwriting
PDF has no text layer, so every page is treated as scanned (rendered, not
text-extracted), which is exactly the photographed-page path. This reuses the
Phase 4 decode member; it is scheduled as a Phase 3 completion item rather than
built now. The captured fixtures for it are real tablet-handwriting PDFs at
`apps/api/tests/fixtures/submission-pdf/` (Git LFS), and they will drive
recorded-response transcription tests when the path lands.

Mode C, writing on the platform with a pen, is new and beyond the guides (which
describe photographing paper). It is chiefly a frontend capture surface: a
stylus or touch canvas on a tablet or phone captures strokes, which are exported
as an image or PDF and submitted through the same upload path, so on the backend
mode C reduces to mode A or B and needs no new server capability beyond mode B.
The surface is the frontend's to design under its own decision when it is built,
honouring the frontend guide's accessibility floor (a keyboard and
file-upload fallback where there is no pen or touch, reduced-motion stills, WCAG
2.2 AA) and adding no personalization that would tempt PII into a student
surface. Flagged as a guide extension: the product's anti-paper intent supports
it, but the guides do not yet mention on-platform capture, so this records the
addition rather than assuming it.

Addendum (2026-07-25): the implementations are now scheduled as their own slice,
Phase 6.5 in the build plan, after mastery integration rather than as a Phase 3
completion item, so evidence from the new modes flows through the live model
instead of a pipeline that is still moving. The three-mode design above is
unchanged; only the scheduling moved, and the plan document now carries it (mode
B backend, mode C frontend capture, and the unified submission surface).

Addendum (2026-07-25, later): mode B is implemented as milestone 6.5.1. The
submission pipeline gained a pre-loop expansion stage behind the existing
`PdfDecoder` seam: an `application/pdf` page's bytes are rendered to rasters
(always the raster, never a text layer), the page-count and per-page size
limits are re-enforced against the rendered result (a PDF's true page count is
unknown until render; over-limit fails the submission with the stated copy),
the rasters are stored under the submission prefix, and the page rows are
rewritten in one writer transaction as ordinary image rows, re-sequenced in
place. Expansion is idempotent (no PDF row survives it, so a retried job skips
it) and everything downstream, preprocess, the vision read, the content-hash
cache keyed on the rendered bytes, regions, SSE, indexing, and evidence
emission, is untouched, which the gate's parity test asserts: the same
handwriting as a photo and as an exported PDF reaches the same transcription
and the same evidence shape. The manifest limits moved to the dependency-free
`app/limits.py` so both the upload surface and the pipeline enforce them
without an import cycle. The committed tablet PDFs drive a skip-gated
real-render round trip; modes C and the unified surface remain the frontend's
(6.5.2, 6.5.3).
