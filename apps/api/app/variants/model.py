"""The two model seams of the generation loop (backend guide 6.3): the
generator (one text call producing the variant body and its worked solution)
and the verifier (an independent re-solve that sees only the variant's
question, with the essential figures attached as images, never the first
pass's solution or reasoning). Agreement is decided by the Rust comparer, not
by either model.

Figure bytes never enter a text prompt: the generator sees fig:// tokens in
the text, and the verifier receives the figures as attached images, which is
one of the spec's sanctioned attach points (the verification re-solve).
Tests always use the recorded implementations.
"""

import json
import os
from pathlib import Path
from typing import Protocol

from pydantic import BaseModel, Field

from app.model_text import text_of
from app.prompt_safety import document_key

# Claude via the Anthropic API for both passes. Concrete model ids are
# deployment configuration; provenance records whatever ran. Two variables so
# verification can run a different model than generation (independence is the
# point of the second pass).
DEFAULT_GENERATION_MODEL = os.environ.get(
    "TIRO_GENERATION_MODEL_ID", "claude-sonnet-5"
)
DEFAULT_VERIFICATION_MODEL = os.environ.get(
    "TIRO_VERIFICATION_MODEL_ID", "claude-sonnet-5"
)


class GeneratedVariant(BaseModel, frozen=True):
    """The generation pass's output: the variant body (fig:// tokens intact),
    a full worked solution, and the structured final answers the comparer
    reads. Token counts come from the provider response (zero in recorded
    replays) and feed the per-course accounting (guide 6.4)."""

    body_md: str
    solution_md: str
    final_answers: list[str] = Field(default_factory=list)
    input_tokens: int = 0
    output_tokens: int = 0


class ReSolveResult(BaseModel, frozen=True):
    """The verification pass's output: its own worked solution and final
    answers, produced cold from the variant's question and figures."""

    solution_md: str
    final_answers: list[str] = Field(default_factory=list)
    input_tokens: int = 0
    output_tokens: int = 0


def parse_generated(text: str) -> GeneratedVariant:
    return GeneratedVariant.model_validate(json.loads(text))


def parse_resolved(text: str) -> ReSolveResult:
    return ReSolveResult.model_validate(json.loads(text))


class VariantGenerator(Protocol):
    async def generate(
        self, document: str, prompt: str, *, model_id: str
    ) -> GeneratedVariant: ...


class VariantVerifier(Protocol):
    async def resolve(
        self, document: str, images: list[bytes], prompt: str, *, model_id: str
    ) -> ReSolveResult: ...


def _text_of(message: object) -> str:
    return text_of(message, "model")


class AnthropicVariantGenerator:
    """The live generator: Claude via the Anthropic API, text only. Never
    exercised in the test suite; the live-model smoke test runs in its own
    non-blocking CI lane."""

    def __init__(self, api_key: str | None = None) -> None:
        self._api_key = api_key or os.environ.get("TIRO_ANTHROPIC_API_KEY")

    async def generate(
        self, document: str, prompt: str, *, model_id: str
    ) -> GeneratedVariant:
        from anthropic import AsyncAnthropic

        client = AsyncAnthropic(api_key=self._api_key)
        message = await client.messages.create(
            model=model_id,
            max_tokens=8192,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "text", "text": document},
                    ],
                }
            ],
        )
        generated = parse_generated(_text_of(message))
        usage = getattr(message, "usage", None)
        return generated.model_copy(
            update={
                "input_tokens": int(getattr(usage, "input_tokens", 0) or 0),
                "output_tokens": int(getattr(usage, "output_tokens", 0) or 0),
            }
        )


class AnthropicVariantVerifier:
    """The live verifier: Claude via the Anthropic API with the essential
    figures attached as images (the sanctioned attach point for the
    verification re-solve)."""

    def __init__(self, api_key: str | None = None) -> None:
        self._api_key = api_key or os.environ.get("TIRO_ANTHROPIC_API_KEY")

    async def resolve(
        self, document: str, images: list[bytes], prompt: str, *, model_id: str
    ) -> ReSolveResult:
        import base64
        from typing import Any

        from anthropic import AsyncAnthropic

        blocks: list[Any] = []
        for image in images:
            media_type = (
                "image/jpeg" if image[:3] == b"\xff\xd8\xff" else "image/png"
            )
            blocks.append(
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": media_type,
                        "data": base64.b64encode(image).decode("ascii"),
                    },
                }
            )
        blocks.append({"type": "text", "text": prompt})
        blocks.append({"type": "text", "text": document})
        client = AsyncAnthropic(api_key=self._api_key)
        message = await client.messages.create(
            model=model_id,
            max_tokens=8192,
            messages=[{"role": "user", "content": blocks}],
        )
        resolved = parse_resolved(_text_of(message))
        usage = getattr(message, "usage", None)
        return resolved.model_copy(
            update={
                "input_tokens": int(getattr(usage, "input_tokens", 0) or 0),
                "output_tokens": int(getattr(usage, "output_tokens", 0) or 0),
            }
        )


class RecordedVariantGenerator:
    """The test/replay generator, keyed by the sha256 of the exact document.
    Recorded responses are project assets under
    apps/api/tests/recorded/variant-generation/."""

    def __init__(self, responses: dict[str, GeneratedVariant]) -> None:
        self._responses = dict(responses)
        self.calls = 0
        self.documents: list[str] = []

    def record(self, document: str, variant: GeneratedVariant) -> None:
        key = document_key(document)
        self._responses[key] = variant

    async def generate(
        self, document: str, prompt: str, *, model_id: str
    ) -> GeneratedVariant:
        self.calls += 1
        self.documents.append(document)
        key = document_key(document)
        if key not in self._responses:
            raise KeyError(f"no recorded generation for document sha256 {key}")
        return self._responses[key]

    @classmethod
    def from_dir(cls, directory: Path) -> "RecordedVariantGenerator":
        return cls(
            {
                path.stem: GeneratedVariant.model_validate_json(
                    path.read_text(encoding="utf-8")
                )
                for path in sorted(directory.glob("*.json"))
            }
        )


class RecordedVariantVerifier:
    """The test/replay verifier, keyed by the sha256 of the exact document; it
    also keeps the images it was shown so tests can assert the figures
    travelled as pixels. Recorded responses are project assets under
    apps/api/tests/recorded/variant-verification/."""

    def __init__(self, responses: dict[str, ReSolveResult]) -> None:
        self._responses = dict(responses)
        self.calls = 0
        self.documents: list[str] = []
        self.images: list[list[bytes]] = []

    def record(self, document: str, result: ReSolveResult) -> None:
        key = document_key(document)
        self._responses[key] = result

    async def resolve(
        self, document: str, images: list[bytes], prompt: str, *, model_id: str
    ) -> ReSolveResult:
        self.calls += 1
        self.documents.append(document)
        self.images.append(list(images))
        key = document_key(document)
        if key not in self._responses:
            raise KeyError(f"no recorded re-solve for document sha256 {key}")
        return self._responses[key]

    @classmethod
    def from_dir(cls, directory: Path) -> "RecordedVariantVerifier":
        return cls(
            {
                path.stem: ReSolveResult.model_validate_json(
                    path.read_text(encoding="utf-8")
                )
                for path in sorted(directory.glob("*.json"))
            }
        )
