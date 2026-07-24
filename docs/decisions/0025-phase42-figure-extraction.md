# 0025 — Phase 4.2: figure extraction, the deterministic detector

Date: 2026-07-24. Phase 4, milestone 4.2. Author: backend engineer (Claude).

**The deterministic figure detector of Stage 1b lives in the `tirocinium-pdf`
member: it pulls embedded rasters from the PDF stream losslessly and renders
clustered vector drawings at 300 dpi, and the Python side stores those pixels
content-addressed in object storage, rows only their metadata, and places a
`![caption](fig://{id})` token in the page markdown, so figure bytes never enter
a text prompt.** The governing constraint is "figures are pixels from the
professor's original," and it is made mechanical here. During the object-tree
walk, an image object's raw stream is taken byte for byte when it is a complete
JPEG (a DCTDecode stream, magic `FF D8 FF`), which is the byte-identical path the
Phase 4 gate requires; any other raster is decoded and re-encoded to lossless PNG
without resampling. Clusters of vector paths that touch or nearly touch are
merged into a drawing and each qualifying region (at least two paths over a
minimum area, so a lone rule line is not a figure) is rendered at 300 dpi with a
2x rendition alongside; a rendered region is hash-stable, not byte-identical,
because it is drawn rather than extracted. The cluster thresholds are placeholders
to calibrate against the five-PDF corpus, the way the preprocess crate's
thresholds await the photo corpus. The feasibility of byte-identical extraction
was proven with a spike before the detector was built, since pdfium giving back
the raw stream unchanged was the make-or-break, exactly as the native load was
for 4.1.

Extraction runs behind a `FigureExtractor` seam (`app/imports/decoder.py`),
`PdfiumFigureExtractor` in production and `FakeFigureExtractor` in tests, the same
shape as the decoder: deterministic CPU work, a direct call rather than a recorded
response, its tests skipping when the binary is absent. The decode pipeline runs
it on born-digital pages after decoding a page's text, before caching: figures go
to object storage content-addressed (`imports/{course}/figures/{sha256}.{ext}`,
plus a `.2x.png` for renders) so a figure shared across imports is stored and
rowed once, deduped by the `figures.content_hash` UNIQUE key (migration
course/0009, the guide's schema verbatim); only metadata lands in the shard; and
the page markdown gains the fig:// token. Because the annotated markdown is cached
under the page raster's content hash, a byte-identical re-upload returns the same
tokens over the same deduped figure rows.

Two decisions the phases document and guide left to resolve are recorded here.
First, the phases document lists "the vision detector's proposed boxes" under
4.2, but the guide says the model detector runs during the Stage 2 segmentation
pass; the guide wins, so 4.2 ships the deterministic detector and the seam, and
the vision detector's boxes and their union with the deterministic set join in
4.3, where the segmentation vision pass runs. Second, fig:// placement: a figure
is placed into the page markdown at its vertical position proportionally (a figure
a third of the way down the page lands about a third of the way through the text
lines), which honours reading order without a per-line text-position map;
precise inline interleaving that splits a paragraph around a figure is refinement
that benefits from the real corpus layouts and is deferred. A caption is guessed
in Rust from the nearest horizontally-overlapping text block within 36 points
below the figure (or above, if none is below), and the professor confirms or
replaces it in 4.4. Scanned-page figures (page crops the vision detector
proposes) are not part of 4.2; the `page_crop` source and the `item_figures` link
table arrive with 4.3.
