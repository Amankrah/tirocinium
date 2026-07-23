"""Indexing and retrieval (milestone 3.4, backend guide section 4 Stage 4,
decision 0020). The Stage 4 indexing step makes a processed submission
searchable (FTS5 plus an int8-quantized embedding), and the course search
endpoint runs hybrid retrieval over it (BM25 and vector similarity fused with
reciprocal rank fusion). The embedding vector comes from a provider seam; the
quantization and similarity live in platform_core.embedding."""

from app.retrieval.routes import router

__all__ = ["router"]
