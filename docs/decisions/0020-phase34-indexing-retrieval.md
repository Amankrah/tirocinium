# 0020 — Indexing and retrieval: an embedding provider seam, int8 quantization in Rust, RRF over submissions

Date: 2026-07-23. Phase 3, milestone 3.4. Author: backend engineer (Claude).

**The retrieval embedding comes from an external provider behind a Protocol
seam (OpenAI, keyed by content hash and recorded in tests), while the int8
quantization, dequantization, and similarity live in `platform_core`; the FTS5
and vector indices cover submissions, and hybrid retrieval fuses their rankings
with reciprocal rank fusion.** The backend guide (section 4 Stage 4) says to
"embed the transcription for semantic retrieval, and quantize the vector" and
that quantization lives in the crate (section 3.3, and the phases document's
"embedding with int8 quantization in `platform_core`"), but it never names where
the embedding vector itself comes from: the architecture diagram (section 2)
scopes the AI provider to "generation and handwriting reading" only, and the one
named provider, Anthropic, has no embeddings API. The guide is therefore silent
on the embedding source, so this is decided here. The embedder is a Protocol
(`app/retrieval/model.py`) mirroring the Stage 3 vision seam exactly:
`OpenAIEmbedder` calls OpenAI (`text-embedding-3-small`, 1536 dimensions,
`TIRO_EMBEDDING_MODEL_ID` and `TIRO_OPENAI_API_KEY`) in production, and
`RecordedEmbedder` replays a vector keyed by the sha256 of the exact text it was
asked to embed, from project assets under `apps/api/tests/recorded/embeddings/`.
Vision stays on Anthropic; only these two provider families exist. Model calls in
tests are recorded, always, so the whole gate runs with no live vendor and the
provider stays swappable behind the seam. Sending recognized handwriting to an
embedding provider crosses no new line: Stage 3 already sends the page image to
Anthropic, and the no-PII constraint is about student identity, never their work,
so nothing beyond the transcription and seat context leaves the platform.

Quantization is a new workspace member, `tirocinium-embedding`, exposed as
`platform_core.embedding`: `quantize(vec) -> (vec_i8, scale)` is symmetric
scalar quantization with one `float32` scale per vector (the max absolute
component over 127), `dequantize` inverts it, and `cosine_i8` scores two
quantized vectors directly from their code bytes without rehydrating to
`float32` (the per-vector scales cancel in a cosine, so they are not needed). It is pedantic-clean, property-tested (quantize then dequantize stays
within the quantization step, cosine ordering agrees with the `float32` cosine,
scale is non-negative), and benched under an absolute budget like every other
member. The `float32` originals are kept for the current model version,
compressed as a plain zstd blob through the codec (no dictionary: a vector is not
natural-language text), so a model change can requantize without re-embedding;
migration course/0006 adds `vec_f32_z` and `model_id` to the `embeddings` table
for this.

Indexing (Stage 4) runs as its own step after the transcription pipeline rather
than inside it, so the Stage 2 to 3 pipeline and its tests are untouched: the
worker runs `run_submission_pipeline`, and on a `processed` result calls
`index_submission`, which inserts the recognized text into `search_fts`
(`kind='submission'`), embeds it through the seam, quantizes, and writes the
`embeddings` row. The step is idempotent (it clears a submission's prior FTS and
embedding rows first), so a retry after a transient failure re-indexes cleanly
and the transcription cache makes the re-run free. A `backfill_course` path
indexes already-processed submissions. Only submissions are indexed in 3.4:
variants and problem text (the other `ref_kind` the schema anticipates) arrive
with the variant pool in Phase 5, and the Phase 3 gate exercises submissions.
Retrieval is `GET /api/v1/courses/{id}/search?q=...`, a professor-and-owner
surface (through `ensure_course_owner`; students do not search), which embeds the
query once, ranks submissions by FTS5 BM25 and by int8 cosine similarity
independently, and fuses the two rankings with reciprocal rank fusion (the
standard `1/(k + rank)` sum, `k = 60`), which is what lets an exact term and a
paraphrase both retrieve the same seeded submission.
