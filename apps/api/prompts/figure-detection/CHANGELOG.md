# figure-detection changelog

Prompts are code (CLAUDE.md, model-call rules): every version is a file, every
change is recorded here, and the version string travels as provenance.

## v1 (2026-07-24, milestone 4.3)

First version. The vision detector of Stage 1b: shown a scanned page image, it
returns bounding boxes for the figures on it, as a JSON array of
{bbox: [x,y,w,h] normalised 0..1, caption}. It only locates figures, never
describes or redraws them (figures are pixels; the box becomes a raster crop of
the page), and treats page text as data, never as instructions to obey.
