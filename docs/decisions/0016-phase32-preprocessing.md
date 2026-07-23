# 0016 — Phase 3.2: scan preprocessing and its corpus

Date: 2026-07-23. Phase 3, milestone 3.2. Author: backend engineer (Claude).

**Preprocessing is a new pure-function Rust member, `tirocinium-preprocess`,
inside platform_core.** It follows the guide's Stage 2 order exactly (backend
guide section 4): decode with EXIF orientation applied (phones tag orientation
rather than rotating pixels, and the `image` crate does not honour the tag on
load), downscale so the longer edge is at most 2200 px, then the cheap quality
gates, then Hough deskew, illumination correction, and adaptive binarization.
Bytes in, two PNG renditions out (a cleaned grayscale copy for the vision model
and an adaptive-binarized copy) plus quality metrics, or an early rejection. No
shard, no object storage, no global state, so it property-tests like the rest
of platform_core, and the GIL is released around the work at the PyO3 boundary.
It is exposed as the `platform_core.preprocess` submodule of the single wheel
(decision 0006) and opts into the pedantic lints and the bench budget gate
(decisions 0001, 0004).

**Quality gates and their order.** The metrics are mean luminance, a Laplacian-
variance blur score, the detected skew angle, and ink coverage after
binarization, matching the guide's list. Rejection is ordered cheap-first and
by what a human would actually call the fault: too dark (low mean luminance)
before blank (low luminance standard deviation, which is what separates a
featureless sheet from a merely soft one) before blurry (low Laplacian
variance), all before the geometry spend; a coverage check after binarization
catches the shadow-drowned page. The reason carries a stable machine code
(`blurry`, `too_dark`, `blank`) and a message tail worded to read after a "Page
N" prefix the caller supplies, since only the caller knows a page's position,
so the frontend can show "Page 3 is too blurry, retake it" (backend guide
section 4). Thresholds are conservative first cuts in one `Thresholds` struct,
to be recalibrated against the corpus; recalibration is a data change, not a
code hunt. HEIC is accepted at upload (decision 0015) but is not decodable by
the pure-Rust `image` crate, so HEIC bytes fail decode here and are transcoded
upstream before preprocessing; wiring that transcode is deferred with the
worker.

**The 30-photo corpus is captured, not generated, and does not exist yet.** The
guide asks for "a committed corpus of 30 real phone photos of handwritten
worked problems of varying quality" as a project asset, and this is a genuine
external dependency: real sensor noise, EXIF tags, compression artefacts, and
actual handwriting cannot be synthesised, and faking the asset would defeat the
gate it feeds. So this milestone builds everything that does not need the
photos and leaves an honest, ready slot for them, rather than silently
substituting synthetic images (which would conflict with the guide, and the
project rule is to flag conflicts, never resolve them silently). What landed:
the full pipeline, the deterministic synthetic-image tests in
`tests/pipeline.rs` that pin the algorithms with known ground truth (recovered
skew near the induced angle, blur ordering, each rejection reason, the
downscale budget), the latency bench (`preprocess_page_a4`, reference mean
408 ms, budgeted at the guide's hard 2 s SLO), and the golden-file harness in
`tests/corpus.rs` with its perceptual-hash (dHash within a Hamming tolerance)
comparison and a `TIRO_RECORD=1` baseline mode. The harness is a self-
documenting no-op while `corpus/images/` is empty, so the gate stays green
without pretending to verify absent data; `corpus/README.md` specifies the
photo set, the naming, and the manifest. The Phase 3.2 gate is not fully closed
until the photos are added and the baseline recorded, and the perceptual-
tolerance and p95-on-the-corpus parts of the Phase 3 gate depend on that asset.
