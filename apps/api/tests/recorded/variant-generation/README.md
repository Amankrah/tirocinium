# Recorded variant-generation responses

Recorded model responses for the generation pass (backend guide 6.3 step 2,
milestone 5.3), one JSON file per document, named for the sha256 of the exact
document text the model was shown (the base case study and solution as
delimited content, the sampled values beside their bases, the invariants, and
the solution method, assembled by `generation_document`). The
`RecordedVariantGenerator` (app/variants/model.py) replays these.

Each file is a JSON object matching `GeneratedVariant`: `body_md` (fig://
tokens intact, byte for byte the professor's figures), `solution_md`, and
`final_answers` (the structured list the Rust comparer reads). The pipeline
tests build their generator in memory, so the gate needs no committed asset;
this is where a captured set lands as real corpora grow.

Versioned prompts live at `apps/api/prompts/variant-generation/`.
