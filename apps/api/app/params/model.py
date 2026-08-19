"""The vision seam for the figure-frozen check (backend guide 6.1, milestone
5.1): one call per figure, ever, reading the literal values a figure displays
so parameterization can refuse to vary a value that is printed inside a
diagram. The figure travels as an attached image to a vision model, which the
guide sanctions here exactly as it does for the verification re-solve; figure
bytes still never enter a text prompt. Tests always use the recorded
implementation; readings are cached by figure content hash (figure_readings),
so the live model sees each distinct figure once.
"""

import hashlib
import json
import os
from pathlib import Path
from typing import Literal, Protocol

from pydantic import BaseModel, Field

from app.model_text import text_of

# Claude via the Anthropic API, like every vision call in the platform. The
# concrete model id is deployment configuration; provenance records what ran.
DEFAULT_FIGURE_READING_MODEL = os.environ.get(
    "TIRO_VISION_MODEL_ID", "claude-sonnet-5"
)


class FigureReading(BaseModel, frozen=True):
    """The literal values a figure displays: numbers with their units, labels,
    axis text. Nothing here describes or interprets the figure; it is the list
    of strings a reader could point at."""

    values: list[str] = Field(default_factory=list)


def parse_reading(text: str) -> FigureReading:
    """Parse a model response (a single JSON object per the prompt) into a
    FigureReading, validating the shape."""
    return FigureReading.model_validate(json.loads(text))


class FigureReader(Protocol):
    """Read the displayed values of one figure. The image is the figure's
    lossless original bytes; the prompt is the versioned reading prompt."""

    async def read(
        self, image: bytes, prompt: str, *, model_id: str
    ) -> FigureReading: ...


class AnthropicFigureReader:
    """The live reader. Never exercised in the test suite (model calls in
    tests are always recorded); the live-model smoke test runs in its own
    non-blocking CI lane."""

    def __init__(self, api_key: str | None = None) -> None:
        self._api_key = api_key or os.environ.get("TIRO_ANTHROPIC_API_KEY")

    async def read(
        self, image: bytes, prompt: str, *, model_id: str
    ) -> FigureReading:
        import base64

        from anthropic import AsyncAnthropic

        # Figures are stored as their lossless originals: an embedded JPEG
        # byte for byte, everything else PNG.
        media_type: Literal["image/jpeg", "image/png"] = (
            "image/jpeg" if image[:3] == b"\xff\xd8\xff" else "image/png"
        )
        client = AsyncAnthropic(api_key=self._api_key)
        message = await client.messages.create(
            model=model_id,
            max_tokens=2048,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": media_type,
                                "data": base64.b64encode(image).decode("ascii"),
                            },
                        },
                        {"type": "text", "text": prompt},
                    ],
                }
            ],
        )
        text = text_of(message, "vision model")
        return parse_reading(text)


class RecordedFigureReader:
    """The test/replay reader: returns a reading recorded against the sha256
    of the exact figure bytes. Recorded responses are project assets under
    apps/api/tests/recorded/figure-reading/."""

    def __init__(self, responses: dict[str, FigureReading]) -> None:
        self._responses = dict(responses)
        self.calls = 0

    async def read(
        self, image: bytes, prompt: str, *, model_id: str
    ) -> FigureReading:
        self.calls += 1
        key = hashlib.sha256(image).hexdigest()
        if key not in self._responses:
            raise KeyError(f"no recorded figure reading for sha256 {key}")
        return self._responses[key]

    @classmethod
    def from_dir(cls, directory: Path) -> "RecordedFigureReader":
        """Load recorded responses from a directory of {sha256}.json files."""
        responses = {
            path.stem: FigureReading.model_validate_json(
                path.read_text(encoding="utf-8")
            )
            for path in sorted(directory.glob("*.json"))
        }
        return cls(responses)


def get_figure_reader() -> FigureReader:
    """FastAPI dependency: the live reader, overridden in tests."""
    return AnthropicFigureReader()
