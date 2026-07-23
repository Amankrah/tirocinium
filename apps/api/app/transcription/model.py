"""The vision-model seam for handwriting reading (backend guide section 4
Stage 3). Preprocessed grayscale page in, a structured transcription out. The
real implementation calls Claude via the Anthropic API; tests always use the
recorded-response implementation (never a live model), which is why the whole
surface is one small Protocol.
"""

import hashlib
import json
import os
from pathlib import Path
from typing import Protocol

from pydantic import BaseModel, Field

# The placeholder a transcription uses for a span it cannot read; the prompt
# instructs the model to emit exactly this rather than guess.
ILLEGIBLE_TOKEN = "[[illegible]]"

# Claude via the Anthropic API (backend guide section 4 Stage 3). The concrete
# model id is deployment configuration; provenance records whatever was used.
DEFAULT_VISION_MODEL = os.environ.get("TIRO_VISION_MODEL_ID", "claude-3-5-sonnet-latest")


class Region(BaseModel, frozen=True):
    """One transcribed region of the page, with its normalised bounding box
    (top-left origin, 0..1) and confidence, so the review surface can align
    the text to the scan and highlight low-confidence spans."""

    bbox: tuple[float, float, float, float]
    confidence: float = Field(ge=0.0, le=1.0)
    text: str = ""


class PageTranscription(BaseModel, frozen=True):
    """The model's reading of one page: Markdown with LaTeX maths, an overall
    confidence, and per-region detail."""

    markdown: str
    confidence: float = Field(ge=0.0, le=1.0)
    regions: list[Region] = Field(default_factory=list)


def parse_transcription(text: str) -> PageTranscription:
    """Parse a model response (a single JSON object per the prompt) into a
    PageTranscription, validating the shape."""
    return PageTranscription.model_validate(json.loads(text))


class VisionTranscriber(Protocol):
    """Read one preprocessed grayscale page. The image is PNG bytes; the
    prompt is the versioned transcription prompt."""

    async def transcribe(
        self, image_png: bytes, prompt: str, *, model_id: str
    ) -> PageTranscription: ...


class AnthropicTranscriber:
    """The live reader: Claude via the Anthropic API. Never exercised in the
    test suite (model calls in tests are always recorded); the live-model smoke
    test runs in its own non-blocking CI lane."""

    def __init__(self, api_key: str | None = None) -> None:
        self._api_key = api_key or os.environ.get("TIRO_ANTHROPIC_API_KEY")

    async def transcribe(
        self, image_png: bytes, prompt: str, *, model_id: str
    ) -> PageTranscription:
        import base64

        from anthropic import AsyncAnthropic

        client = AsyncAnthropic(api_key=self._api_key)
        message = await client.messages.create(
            model=model_id,
            max_tokens=4096,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": "image/png",
                                "data": base64.b64encode(image_png).decode("ascii"),
                            },
                        },
                        {"type": "text", "text": prompt},
                    ],
                }
            ],
        )
        block = message.content[0]
        text = getattr(block, "text", None)
        if text is None:
            raise ValueError("vision model returned no text block")
        return parse_transcription(text)


class RecordedTranscriber:
    """The test/replay reader: returns a transcription recorded against the
    sha256 of the exact image bytes, so a given page always yields the same
    reading and no network call happens. Recorded responses are project assets
    (Git LFS from Phase 3 on); load a directory of them with from_dir."""

    def __init__(self, responses: dict[str, PageTranscription]) -> None:
        self._responses = dict(responses)
        self.calls = 0

    async def transcribe(
        self, image_png: bytes, prompt: str, *, model_id: str
    ) -> PageTranscription:
        self.calls += 1
        key = hashlib.sha256(image_png).hexdigest()
        if key not in self._responses:
            raise KeyError(f"no recorded transcription for image sha256 {key}")
        return self._responses[key]

    @classmethod
    def from_dir(cls, directory: Path) -> "RecordedTranscriber":
        """Load recorded responses from a directory of {sha256}.json files."""
        responses = {
            path.stem: PageTranscription.model_validate_json(
                path.read_text(encoding="utf-8")
            )
            for path in sorted(directory.glob("*.json"))
        }
        return cls(responses)
