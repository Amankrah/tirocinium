# The PDF ingestion corpus

Five real problem-set PDFs (mixed born-digital and scanned, with schematics,
charts, and process diagrams), the Phase 4 gate's golden asset (backend guide
section 5; project phases 4). It is a captured, not generated, project asset:
synthetic PDFs cannot stand in, because the gate exists to catch a real diagram
that a synthetic fixture would never exercise (a re-crop that silently rescaled,
a photographed schematic misclassified, an embedded raster re-encoded). The small
synthetic fixtures under `../tests/fixtures/` pin the unit-level behaviour; this
corpus pins the real round-trip.

## What the gate asserts (harness in `../tests/corpus.rs`)

Per PDF, decoded and figure-extracted through the real crate, against a recorded
baseline in `expectations.json`:

- **Page classification**: each page is born-digital or scanned, exactly as
  recorded (the alnum-count threshold in `lib.rs`).
- **Text extraction** (born-digital pages): a content fingerprint (FNV-1a of the
  whitespace-normalised extracted text) plus its character count, so a drift in
  what pdfium pulls out is caught. Whitespace is normalised first so spacing
  wobble alone does not fail it; the fingerprint is otherwise exact.
- **Figure fidelity**, the crux of the gate ("every figure byte-identical or
  hash-stable"):
  - an **embedded raster** must be byte-identical: an FNV-1a of the extracted
    bytes plus their length, which any single-byte change flips (a re-encode or
    resample would). The recorded `width_px`/`height_px` must match exactly.
  - a **rendered vector region** must be hash-stable: a perceptual dHash of the
    rendition within a Hamming tolerance of 6, with dimensions within 2 px, which
    absorbs pdfium's rasteriser wobble across builds and platforms while still
    catching a genuine change (the same tolerance the preprocess corpus uses for
    its grayscale renditions).
  - each figure's `bbox` (page points, `[x, y, w, h]`) within 1 pt.

Token positioning ("positioned at its token") is asserted on the Python side,
where `_place_tokens` inserts the `fig://` token into the page markdown
(`apps/api/app/imports/test_figures.py`); this crate owns the byte round-trip.
The vision-detector and segmentation halves of a full run replay recorded model
responses under `apps/api/tests/recorded/figure-detection/` and `.../segmentation/`
(keyed by page-image and document hash); capture those from the same PDFs.

## Placing the corpus

1. Drop the five PDFs under `pdfs/`. Git LFS routes `*.pdf` there already
   (`.gitattributes`); run `git lfs install` once if you have not. Name them
   sorted and descriptive, e.g. `01_circuits_born_digital.pdf`,
   `05_thermo_scanned.pdf`; the harness sorts by filename and keys expectations by
   it. Between them cover: born-digital and scanned pages, an embedded photograph
   (raster), a vector schematic, a chart, and a process diagram.
2. Provision pdfium if you have not (`infra/setup.sh`, or point `TIRO_PDFIUM_LIB`
   at a `chromium/7961` build). The harness skips without it, so record where it
   is provisioned.
3. Record the baseline and review it before committing:

       TIRO_RECORD=1 cargo test -p tirocinium-pdf --test corpus

   Read the written `expectations.json` (byte counts, figure counts, page kinds)
   against the actual PDFs before committing it: the recording is only as correct
   as the pipeline was the day it ran, so a human confirms it captured the right
   thing, not just a self-consistent one.

Until `pdfs/` has files the harness is a self-documenting no-op, so the gate stays
green without pretending to verify absent data.

## The platform caveat

`expectations.json` is recorded on one platform and pdfium build (CI's, a pinned
`chromium/7961`). Text fingerprints and raster bytes are exact and portable; the
vector-region dHash carries a Hamming tolerance precisely because rasterisation is
not bit-identical across platforms. If a legitimate pipeline or pdfium-build
change moves the baselines, re-record and review the diff rather than loosening a
tolerance to paper over it.
