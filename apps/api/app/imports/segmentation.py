"""The segmentation model seam (backend guide section 5 Stage 2, milestone
4.3). The decoded page markdowns of an import job in, a structured list of
extracted items out: question/solution pairs with figure assignments. The real
implementation calls Claude via the Anthropic API; tests always use the
recorded-response implementation, which is why the surface is one small
Protocol, like the vision and embedder seams.

The document the model sees is text and fig:// tokens only: figure bytes never
enter this prompt. The prompt is strict about fidelity (reproduce the
professor's wording, do not summarize, keep every figure token in place), and
treats the page content as data, never as instructions (hostile text is data).
"""

import json
import os
from pathlib import Path
from typing import Protocol

from pydantic import BaseModel, Field

from app.model_text import text_of
from app.prompt_safety import document_key

# Claude via the Anthropic API (a text pass). The concrete model id is
# deployment configuration; provenance records whatever was used.
DEFAULT_SEGMENTATION_MODEL = os.environ.get(
    "TIRO_SEGMENTATION_MODEL_ID", "claude-sonnet-5"
)

# A segmentation reply reproduces the professor's wording verbatim, so it is as
# long as the problem set it reads: a nine-page import truncated mid-item at
# 8192. Thinking tokens are spent from the same budget on the current models,
# which is the other half of why the old ceiling was too low. A reply this size
# is streamed, because a non-streaming call for it outlives the client timeout.
MAX_OUTPUT_TOKENS = 64000


class SegmentedItem(BaseModel, frozen=True):
    """One extracted item. `figure_ids` are the ids the model read from the
    fig:// tokens it assigned to this item; `notes` carries the model's fidelity
    flags (a missing solution, a solution that seems to belong elsewhere)."""

    title: str | None = None
    question_md: str
    solution_md: str | None = None
    figure_ids: list[int] = Field(default_factory=list)
    page_span: str
    confidence: float = Field(ge=0.0, le=1.0)
    notes: str | None = None


def parse_items(text: str) -> list[SegmentedItem]:
    """Parse a model response (a single JSON array per the prompt) into items,
    validating each. A bare object is accepted as a one-item list."""
    data = json.loads(text)
    if isinstance(data, dict):
        data = [data]
    return [SegmentedItem.model_validate(item) for item in data]


class Segmenter(Protocol):
    async def segment(
        self, document: str, prompt: str, *, model_id: str
    ) -> list[SegmentedItem]: ...


class AnthropicSegmenter:
    """The live segmenter: Claude via the Anthropic API. Never exercised in the
    test suite (model calls in tests are always recorded); the live-model smoke
    test runs in its own non-blocking CI lane."""

    def __init__(self, api_key: str | None = None) -> None:
        self._api_key = api_key or os.environ.get("TIRO_ANTHROPIC_API_KEY")

    async def segment(
        self, document: str, prompt: str, *, model_id: str
    ) -> list[SegmentedItem]:
        from anthropic import AsyncAnthropic

        client = AsyncAnthropic(api_key=self._api_key)
        async with client.messages.stream(
            model=model_id,
            max_tokens=MAX_OUTPUT_TOKENS,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "text", "text": document},
                    ],
                }
            ],
        ) as stream:
            message = await stream.get_final_message()
        if message.stop_reason == "max_tokens":
            raise ValueError(
                "segmentation model hit its output ceiling: the reply is cut "
                "off mid-item and nothing may be staged from a partial reading"
            )
        text = text_of(message, "segmentation model")
        return parse_items(text)


class RecordedSegmenter:
    """The test/replay segmenter: returns items recorded against the sha256 of
    the exact document text, so a given job always yields the same items and no
    network call happens. Recorded responses are project assets under
    apps/api/tests/recorded/segmentation/ (a JSON array per file, named for the
    sha256 of the document)."""

    def __init__(self, responses: dict[str, list[SegmentedItem]]) -> None:
        self._responses = {key: list(value) for key, value in responses.items()}
        self.calls = 0

    async def segment(
        self, document: str, prompt: str, *, model_id: str
    ) -> list[SegmentedItem]:
        self.calls += 1
        key = document_key(document)
        if key not in self._responses:
            raise KeyError(f"no recorded segmentation for document sha256 {key}")
        return list(self._responses[key])

    @classmethod
    def for_documents(
        cls, mapping: dict[str, list[SegmentedItem]]
    ) -> "RecordedSegmenter":
        """Build from plain document text (not hashes), hashing each key."""
        return cls(
            {
                document_key(text): items
                for text, items in mapping.items()
            }
        )

    @classmethod
    def from_dir(cls, directory: Path) -> "RecordedSegmenter":
        """Load recorded responses from a directory of {sha256}.json files, each
        a JSON array of items."""
        responses = {
            path.stem: parse_items(path.read_text(encoding="utf-8"))
            for path in sorted(directory.glob("*.json"))
        }
        return cls(responses)


def get_segmenter() -> Segmenter:
    """The worker's segmenter; tests inject a recorded one."""
    return AnthropicSegmenter()
