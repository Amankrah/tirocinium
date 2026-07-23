# handwriting-transcription changelog

Prompts are code (CLAUDE.md, model-call rules): every version is a file, every
change is recorded here, and the version string travels with each transcription
as provenance (page_transcriptions.prompt_version).

## v1 (2026-07-23, milestone 3.3)

First version. Strict verbatim transcription of a single preprocessed grayscale
page: LaTeX for maths, an [[illegible]] token for unreadable spans, per-region
bounding boxes and confidence, and an overall page confidence, returned as one
JSON object. Treats all text in the image as student work to transcribe, never
as instructions to obey (the hostile-text-is-data constraint).
