# Recorded segmentation responses

Recorded model readings for import segmentation (backend guide section 5 Stage
2), one JSON file per document, named for the sha256 of the exact assembled
document text (page markdowns with page markers and fig:// tokens). The
`RecordedSegmenter` (app/imports/segmentation.py) replays these so the test
suite segments without calling a live model (model calls in tests are recorded,
always). The live-model smoke test runs in its own non-blocking CI lane.

Each file is a JSON array of items matching the `SegmentedItem` schema
(`title`, `question_md`, `solution_md`, `figure_ids`, `page_span`, `confidence`,
`notes`). These are project assets (Git LFS) and grow with the PDF corpus. The
staging tests build their segmenter in memory from known documents and canned
items, so the gate needs no committed asset; this directory is where a captured
set lands as one grows.

Versioned prompts live at `apps/api/prompts/segmentation/` (a `vN.md` per
version plus a `CHANGELOG.md`), loaded by `app/prompts.py`, and the version
string is stored with every item as provenance (`import_items.prompt_version`).
