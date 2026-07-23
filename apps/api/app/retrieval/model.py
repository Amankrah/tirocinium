"""The embedding-model seam for semantic retrieval (backend guide section 4
Stage 4, milestone 3.4, decision 0020). Text in, a dense float vector out. The
real implementation calls OpenAI; tests always use the recorded-response
implementation (model calls in tests are recorded, never live), which is why
the whole surface is one small Protocol, exactly like the Stage 3 vision seam.

The vector is quantized to int8 for storage by platform_core.embedding; this
module only produces the float vector.
"""

import hashlib
import json
import os
from pathlib import Path
from typing import Protocol

# OpenAI's text-embedding-3-small (1536 dimensions) by default; the concrete
# model id is deployment configuration and is stored as provenance on every
# embedding row so a model change can be detected and requantized.
DEFAULT_EMBEDDING_MODEL = os.environ.get("TIRO_EMBEDDING_MODEL_ID", "text-embedding-3-small")


class Embedder(Protocol):
    """Embed one text into a dense vector. The model id is passed explicitly so
    provenance records exactly what produced the vector."""

    async def embed(self, text: str, *, model_id: str) -> list[float]: ...


class OpenAIEmbedder:
    """The live embedder: OpenAI's embeddings API. Never exercised in the test
    suite (model calls in tests are always recorded); the live-model smoke test
    runs in its own non-blocking CI lane. The openai client is imported inside
    the call so importing this module (and app.worker) never requires it."""

    def __init__(self, api_key: str | None = None) -> None:
        self._api_key = api_key or os.environ.get("TIRO_OPENAI_API_KEY")

    async def embed(self, text: str, *, model_id: str) -> list[float]:
        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=self._api_key)
        response = await client.embeddings.create(model=model_id, input=text)
        return list(response.data[0].embedding)


class RecordedEmbedder:
    """The test/replay embedder: returns a vector recorded against the sha256 of
    the exact text, so a given text always yields the same vector and no network
    call happens. Recorded responses are project assets under
    apps/api/tests/recorded/embeddings/ (a JSON array of floats per file, named
    for the sha256 of the text); the set grows as the retrieval corpus does."""

    def __init__(self, responses: dict[str, list[float]]) -> None:
        self._responses = dict(responses)
        self.calls = 0

    async def embed(self, text: str, *, model_id: str) -> list[float]:
        self.calls += 1
        key = hashlib.sha256(text.encode("utf-8")).hexdigest()
        if key not in self._responses:
            raise KeyError(f"no recorded embedding for text sha256 {key}")
        return self._responses[key]

    @classmethod
    def for_texts(cls, mapping: dict[str, list[float]]) -> "RecordedEmbedder":
        """Build from plain text (not hashes), hashing each key. Convenience for
        tests that seed known texts and their vectors."""
        return cls(
            {hashlib.sha256(t.encode("utf-8")).hexdigest(): v for t, v in mapping.items()}
        )

    @classmethod
    def from_dir(cls, directory: Path) -> "RecordedEmbedder":
        """Load recorded responses from a directory of {sha256}.json files."""
        responses = {
            path.stem: [float(x) for x in json.loads(path.read_text(encoding="utf-8"))]
            for path in sorted(directory.glob("*.json"))
        }
        return cls(responses)


def get_embedder() -> Embedder:
    """FastAPI dependency for the search endpoint. Defaults to the live OpenAI
    embedder; tests override it with a RecordedEmbedder through
    app.dependency_overrides, so the suite never constructs a live client."""
    return OpenAIEmbedder()
