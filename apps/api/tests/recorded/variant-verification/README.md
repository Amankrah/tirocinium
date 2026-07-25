# Recorded variant-verification responses

Recorded model responses for the independent re-solve (backend guide 6.3 step
3, milestone 5.3), one JSON file per document, named for the sha256 of the
exact document text the model was shown (the variant's question only,
assembled by `verification_document`; the essential figures travel as attached
images beside it, and the first pass's solution and reasoning never appear).
The `RecordedVariantVerifier` (app/variants/model.py) replays these and keeps
the images it was shown so tests can assert the figures travelled as pixels.

Each file is a JSON object matching `ReSolveResult`: `solution_md` and
`final_answers`. Agreement is decided by `platform_core.compare`, never by
either model. The pipeline tests build their verifier in memory, so the gate
needs no committed asset; this is where a captured set lands as real corpora
grow.

Versioned prompts live at `apps/api/prompts/variant-verification/`.
