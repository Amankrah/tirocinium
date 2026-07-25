# Recorded auto-parameterization responses

Recorded model proposals for auto-parameterization (backend guide 6.2,
milestone 5.2), one JSON file per document, named for the sha256 of the exact
document text the model was shown (the confirmed question and solution as
delimited content plus the frozen-value list, assembled by
`proposal_document`). The `RecordedSpecProposer` (app/params/proposal.py)
replays these so the test suite exercises the proposal flow without calling a
live model (model calls in tests are recorded, always).

Each file is a JSON object matching `SpecProposal`: typed parameters carrying
`base`, `literal` (the value's exact text in the question), and a `rationale`,
invariants with rationales, and the inferred solution method. Token positions
are never recorded; the server computes them from the literal. The
auto-parameterize tests build their proposer in memory, so the gate needs no
committed asset; this is where a captured set lands as real corpora grow.

Versioned prompts live at `apps/api/prompts/auto-parameterize/`.
