# pdf-page-transcription changelog

Prompts are code (CLAUDE.md, model-call rules): every version is a file, every
change is recorded here, and the version string travels with each page's
decode as provenance (page_documents.decoder).

## v1 (2026-07-23, milestone 4.1)

First version. Strict verbatim transcription of a single preprocessed grayscale
page from a professor's PDF: LaTeX for maths, an [[illegible]] token for
unreadable spans, per-region bounding boxes and confidence, returned as one
JSON object matching the shared PageTranscription schema. Never describes or
captions figures (figures are preserved as pixels, extracted separately), and
treats all text in the image as document content to transcribe, never as
instructions to obey (the hostile-text-is-data constraint).
