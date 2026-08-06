"""The speech seams (backend guide 6.5: "the speech layers are separate
services behind a thin interface so they can be swapped as the market
moves"). Two Protocols, deliberately minimal:

- SpeechToText: a streaming session that consumes audio chunks and yields
  transcript events, with the provider's endpointing surfaced as a flag on
  the final event (server-side turn-taking builds on it).
- TextToSpeech: text chunks in, audio chunks out, cancellable mid-stream
  (barge-in is a cancel).

The real provider adapters live beside these seams and are chosen per the
Phase 7 provider research (decision record); the fakes in the test suite
implement the same Protocols with scripted timings, which is what the
latency harness runs against. No audio is ever persisted anywhere on the
platform; these seams shuttle bytes between the student and the provider and
keep nothing.
"""

from collections.abc import AsyncIterator
from typing import Protocol

from pydantic import BaseModel


class SttEvent(BaseModel, frozen=True):
    """One transcript event from the streaming recognizer. `final` marks a
    finished utterance segment; `endpoint` marks the provider's judgement
    that the speaker has stopped (end of turn)."""

    text: str
    final: bool = False
    endpoint: bool = False


class SpeechSession(Protocol):
    """One live recognition stream. Push audio in; iterate events out."""

    async def push_audio(self, chunk: bytes) -> None: ...

    def events(self) -> AsyncIterator[SttEvent]: ...

    async def finish(self) -> None:
        """Signal end of audio (typed fallback or socket close)."""
        ...


class SpeechToText(Protocol):
    async def connect(self, *, language: str = "en") -> SpeechSession: ...

    @property
    def provider(self) -> str: ...


class TextToSpeech(Protocol):
    """Synthesize a reply. `stream` consumes the tutor's text chunks as they
    arrive and yields audio chunks as they are ready; a consumer that stops
    iterating (barge-in) must cause the adapter to cancel the provider
    stream."""

    def stream(
        self, text_chunks: AsyncIterator[str], *, voice: str | None = None
    ) -> AsyncIterator[bytes]: ...

    @property
    def provider(self) -> str: ...
