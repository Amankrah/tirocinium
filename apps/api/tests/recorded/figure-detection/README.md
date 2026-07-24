# Recorded figure-detection responses

Recorded vision-model readings for the figure detector (backend guide section 5
Stage 1b), one JSON file per page image, named for the sha256 of the exact page
image bytes the model was shown. The `RecordedFigureDetector`
(app/imports/decoder.py) replays these so the test suite detects figures without
calling a live model (model calls in tests are recorded, always).

Each file is a JSON array of boxes matching `DetectedBox`
(`bbox` = `[x, y, w, h]` normalised 0..1 top-left origin, and an optional
`caption`). The model only locates figures; the box becomes a raster crop of the
page (`platform_core.pdf.crop_figures`), never a re-render or a description. The
pipeline tests build their detector in memory, so the gate needs no committed
asset; this is where a captured set lands as the PDF corpus grows.

Versioned prompts live at `apps/api/prompts/figure-detection/`.
