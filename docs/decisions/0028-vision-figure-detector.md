# 0028 — The vision figure detector, closing Stage 1b's two-detector union

Date: 2026-07-24. Phase 4, completing the figure work of 4.2/4.3. Author:
backend engineer (Claude).

**The second of Stage 1b's two detectors is now built: a vision model proposes
figure boxes on a scanned page, each box is cropped from the page raster into a
`page_crop` figure (never a re-render or a description), and the crops are stored
and fig://-tokenised exactly like the deterministic figures.** This closes the
figure-union work that decision 0025 flagged as pending through 4.2 and 4.3. A
scanned page has no object tree, so the deterministic detector (4.2) finds
nothing on it; the guide's answer is that "every figure is by definition a raster
crop of the preprocessed page," found by the model detector during the Stage 2
pass. The detector is a `FigureDetector` seam (`app/imports/decoder.py`),
`AnthropicFigureDetector` shown the page image in production and
`RecordedFigureDetector` replaying boxes by the sha256 of the image bytes in
tests, with a versioned prompt (`prompts/figure-detection/v1`) that returns
normalised `[x, y, w, h]` boxes and only ever locates figures, never describing,
transcribing, or redrawing one. Sending the page image to a vision model is
allowed and unremarkable (it is the professor's own content, as in the
transcription pass); the figures-are-pixels constraint is about not turning a
figure into text, which the detector never does.

The crop is a new pure-image function in the `tirocinium-pdf` member,
`crop_figures(page_png, boxes)`, which decodes the page raster once and returns a
PNG crop plus pixel rectangle per normalised box. It uses no pdfium (it is a
raster crop, not a render), so its tests run without the native binary. The
pipeline runs the detector on scanned pages after transcription, builds
`page_crop` `ExtractedFigure`s from the crops, and reuses the 4.2 storage and
fig://-placement path, so page crops deduplicate by content hash and carry a
token in the page markdown the same as embedded rasters and vector renders. The
two detectors' results therefore union naturally: born-digital pages carry
deterministic figures, scanned pages carry `page_crop` figures, and they are
disjoint by page kind. Two refinements are deliberately deferred to the five-PDF
corpus: running the detector over born-digital pages too, to catch a figure the
object walk missed, and the spatial de-duplication that a cross-kind overlap
would then need. Recorded so the union is known to be page-kind-partitioned for
now, not silently assumed complete.
