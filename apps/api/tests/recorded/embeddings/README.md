# Recorded embedding responses

Recorded embedding vectors, one JSON file per text, named for the sha256 of the
exact text the embedder was asked to embed. The `RecordedEmbedder`
(app/retrieval/model.py) replays these so the test suite embeds without ever
calling a live model (testing skill: model calls in tests are recorded,
always). The live-model smoke test runs in its own non-blocking CI lane.

These are project assets (Git LFS) and grow deliberately as the retrieval
corpus does. Each file is a JSON array of floats (the dense embedding vector);
`platform_core.embedding.quantize` turns it into the stored int8 codes.

The hybrid-retrieval sanity tests build their `RecordedEmbedder` in memory from
known texts and hand-authored vectors (the same way the transcription pipeline
tests build their transcriber), so no committed asset is required for the gate;
this directory is where a captured corpus lands as one grows.
