# 0033 — The five-PDF corpus harness: how the round-trip is fingerprinted

Date: 2026-07-24. Phase 4 (the ingestion corpus's golden gate). Author: backend
engineer (Claude).

**The five-PDF corpus gate is a record-or-assert harness mirroring the 30-photo
preprocess corpus (decision 0016): empty is a no-op, pdfium-absent skips, and
each committed PDF decodes and figure-extracts against a recorded
`expectations.json`. The guide fixes what must hold ("every figure byte-identical
or hash-stable and positioned at its token") but not the fingerprints, so those
are decided here.** An embedded raster is checked byte-identical by an FNV-1a of
the extracted bytes plus their length; a rendered vector region is checked
hash-stable by a perceptual dHash within a Hamming tolerance of 6 with dimensions
within 2 px; born-digital text by an FNV-1a of the whitespace-normalised text plus
its char count; each bbox within 1 pt; page classification exactly. FNV-1a rather
than SHA-256 because `sha2` is not in the workspace lockfile and a golden gate
needs a change-detector, not a cryptographic one: any single byte flips FNV-1a and
the recorded length is checked alongside, so byte-identity is enforced without a
new (un-vendored) dependency. The dHash-with-tolerance for vector renders is
lifted straight from the preprocess corpus, for the same reason: pdfium's
rasteriser is not bit-identical across builds and platforms, so a perceptual hash
catches a real change while absorbing rounding wobble, whereas an exact hash of a
render would be a cross-platform flake. Text is normalised for whitespace before
hashing (spacing is the common extraction wobble) but otherwise exact; raster
bytes and text fingerprints are portable, and the platform caveat is documented in
the corpus README so a legitimate baseline move is re-recorded, not tolerance-
loosened.

Token positioning, the gate's other half, is deliberately not asserted in this
Rust harness: `_place_tokens` lives in Python (`app/imports/figures.py`) and is
already pinned by `test_figures.py`, so the crate owns the byte round-trip and the
Python suite owns the markdown placement, rather than duplicating a placement
oracle in Rust. The harness completes the code; the data does not exist yet and is
the one piece a session cannot synthesise, exactly as the preprocess corpus's 30
photos are (the PDFs must be real problem sets with real schematics, charts, and
process diagrams, or the gate validates nothing it is meant to). So this lands the
harness green-as-a-no-op and awaits the captured PDFs; recording them with
`TIRO_RECORD=1` also seeds the figure-detection and segmentation recorded
responses those PDFs drive on the Python side. Merge, split, and discard verbs
(decision 0031) remain the other open Phase 4 backend piece.
