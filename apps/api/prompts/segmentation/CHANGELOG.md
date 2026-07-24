# segmentation changelog

Prompts are code (CLAUDE.md, model-call rules): every version is a file, every
change is recorded here, and the version string travels with each import as
provenance.

## v1 (2026-07-24, milestone 4.3)

First version. Segments a decoded problem set (page markdowns with page markers
and fig:// tokens) into items, returning a JSON array of
{title, question_md, solution_md, figure_ids, page_span, confidence, notes}.
Strict about fidelity: reproduce the professor's wording verbatim, keep every
figure token in place and assign it by id, pair questions with solutions and
flag a missing or misplaced solution in notes. Treats the document as data to
segment, never as instructions to obey (the hostile-text-is-data constraint),
and figure bytes never enter the prompt (only fig:// tokens).
