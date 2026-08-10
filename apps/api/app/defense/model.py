"""The model seams of the voice defence (backend guide 6.5, milestones 7.1
and 7.3): the streaming tutor and the closing rubric call. The tutor is
Claude via the Anthropic API like every model on the platform; the speech
layers (STT, TTS) are separate seams in app.defense.speech so they can be
swapped as the market moves. Tests always use the recorded implementations.

Two things about the live call are latency decisions, not style (decision
0044). The session context is large and identical on every turn, so it is
sent with cache breakpoints on the last system block and on the last attached
figure: cached reads skip the prefix computation, which is most of what keeps
first token inside the 800 ms budget on a long context. And the essential
figures ride on the first student turn as image blocks, because images cannot
live in a system prompt, so that is the one place they can be both attached
and part of the stable cached prefix.

The rubric call runs on a *pinned* model version, never a -latest alias,
because the rubric is an evidence source and a silent provider update must
not shift its calibration (mastery spec section 11).
"""

import base64
import hashlib
import json
import os
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any, Protocol

from pydantic import BaseModel, Field

# The conversational turns run on the fastest suitable model, not the platform's
# default authoring model: the latency harness closes the 800 ms budget at p95
# only with a first token near 200 ms (decision 0044), and a defence turn is a
# short spoken question, not the kind of judgement the rubric makes.
DEFAULT_TUTOR_MODEL = os.environ.get("TIRO_TUTOR_MODEL_ID", "claude-3-5-haiku-latest")
# The rubric is off the latency path and is an evidence source, so it runs on
# the stronger model, pinned: a dated snapshot id, deliberately not a -latest
# alias, because a silent provider update must not shift its calibration
# (mastery spec section 11).
DEFAULT_RUBRIC_MODEL = os.environ.get(
    "TIRO_RUBRIC_MODEL_ID", "claude-3-5-sonnet-20241022"
)

CACHE_CONTROL = {"type": "ephemeral"}


class Turn(BaseModel, frozen=True):
    """One conversation turn as the transcript stores it."""

    role: str  # 'student' | 'tutor'
    text: str
    at: int


class TokenUsage(BaseModel, frozen=True):
    """What a seam spent, for the per-course accounting (guide 6.4)."""

    input_tokens: int = 0
    output_tokens: int = 0

    def plus(self, other: "TokenUsage") -> "TokenUsage":
        return TokenUsage(
            input_tokens=self.input_tokens + other.input_tokens,
            output_tokens=self.output_tokens + other.output_tokens,
        )

    def minus(self, other: "TokenUsage") -> "TokenUsage":
        """The spend between two snapshots of a running total, floored at zero
        so a seam that reports nothing can never produce a negative row."""
        return TokenUsage(
            input_tokens=max(0, self.input_tokens - other.input_tokens),
            output_tokens=max(0, self.output_tokens - other.output_tokens),
        )


class RubricConcept(BaseModel, frozen=True):
    """One discussed concept's verdict (mastery spec section 3)."""

    concept_id: int
    reasoning: int = Field(ge=0, le=3)
    gap: str | None = None


class DefenseRubric(BaseModel, frozen=True):
    """The closing structured verdict, validated before anything is ingested:
    a malformed rubric is rejected and retried, never stored."""

    concepts: list[RubricConcept] = Field(default_factory=list)
    concept_to_revisit: int | None = None
    session_confidence: float = Field(ge=0.0, le=1.0)


def parse_rubric(text: str) -> DefenseRubric:
    return DefenseRubric.model_validate(json.loads(text))


class Tutor(Protocol):
    """The conversational model. `stream_reply` yields the reply as text
    chunks (the transport speaks them and captions them); `close_rubric`
    returns the raw closing-verdict text for validation upstream; `usage`
    reports what the session has spent so far."""

    def stream_reply(
        self,
        system: str,
        turns: list[Turn],
        *,
        figures: list[bytes],
        model_id: str,
    ) -> AsyncIterator[str]: ...

    async def close_rubric(
        self,
        system: str,
        turns: list[Turn],
        rubric_prompt: str,
        *,
        figures: list[bytes],
        model_id: str,
    ) -> str: ...

    def usage(self) -> TokenUsage: ...


def image_block(image: bytes) -> dict[str, Any]:
    """One figure as pixels. Extracted bytes are PNG or the professor's own
    JPEG kept byte for byte, so the media type is read from the bytes rather
    than trusted from a filename."""
    media_type = "image/jpeg" if image[:3] == b"\xff\xd8\xff" else "image/png"
    return {
        "type": "image",
        "source": {
            "type": "base64",
            "media_type": media_type,
            "data": base64.b64encode(image).decode("ascii"),
        },
    }


def turn_messages(turns: list[Turn], figures: list[bytes]) -> list[dict[str, Any]]:
    """The conversation as Anthropic messages, with the figures attached to the
    first student turn and the cache breakpoint on the last of them."""
    messages: list[dict[str, Any]] = [
        {
            "role": "user" if turn.role == "student" else "assistant",
            "content": turn.text,
        }
        for turn in turns
    ]
    if figures and messages:
        blocks: list[dict[str, Any]] = [image_block(image) for image in figures]
        blocks[-1] = {**blocks[-1], "cache_control": CACHE_CONTROL}
        first = messages[0]
        blocks.append({"type": "text", "text": str(first["content"])})
        first["content"] = blocks
    return messages


def system_blocks(system: str) -> list[dict[str, Any]]:
    """The system prompt as one cached block: persona plus the session context,
    byte-identical on every turn of a session."""
    return [{"type": "text", "text": system, "cache_control": CACHE_CONTROL}]


class AnthropicTutor:
    """The live tutor: Claude via the Anthropic API, streaming. Never
    exercised in the test suite; the live-model smoke test runs in its own
    lane."""

    def __init__(self, api_key: str | None = None) -> None:
        self._api_key = api_key or os.environ.get("TIRO_ANTHROPIC_API_KEY")
        self._usage = TokenUsage()

    def usage(self) -> TokenUsage:
        return self._usage

    def _client(self) -> Any:
        from anthropic import AsyncAnthropic

        return AsyncAnthropic(api_key=self._api_key)

    def _count(self, usage: Any) -> None:
        self._usage = self._usage.plus(
            TokenUsage(
                input_tokens=int(getattr(usage, "input_tokens", 0) or 0),
                output_tokens=int(getattr(usage, "output_tokens", 0) or 0),
            )
        )

    async def stream_reply(
        self,
        system: str,
        turns: list[Turn],
        *,
        figures: list[bytes],
        model_id: str,
    ) -> AsyncIterator[str]:
        async with self._client().messages.stream(
            model=model_id,
            max_tokens=1024,
            system=system_blocks(system),
            messages=turn_messages(turns, figures),
        ) as stream:
            async for text in stream.text_stream:
                yield text
            final = await stream.get_final_message()
        self._count(final.usage)

    async def close_rubric(
        self,
        system: str,
        turns: list[Turn],
        rubric_prompt: str,
        *,
        figures: list[bytes],
        model_id: str,
    ) -> str:
        messages = turn_messages(turns, figures)
        messages.append({"role": "user", "content": rubric_prompt})
        message = await self._client().messages.create(
            model=model_id,
            max_tokens=1024,
            system=system_blocks(system),
            messages=messages,
        )
        self._count(message.usage)
        block = message.content[0]
        text = getattr(block, "text", None)
        if text is None:
            raise ValueError("rubric model returned no text block")
        return str(text)


class RecordedTutor:
    """The test/replay tutor. Replies replay in order (a scripted
    conversation) and rubric responses likewise, so a test can stage a
    malformed verdict followed by a well-formed retry. It keeps what it was
    shown, which is how the suite asserts that the figures travelled as pixels
    and that no answer leaked into the prompt. Recorded assets live under
    apps/api/tests/recorded/defense/."""

    def __init__(
        self,
        replies: list[str] | None = None,
        rubrics: list[str] | None = None,
    ) -> None:
        self._replies = list(replies or [])
        self._rubrics = list(rubrics or [])
        self.reply_calls = 0
        self.rubric_calls = 0
        self.seen_systems: list[str] = []
        # The rubric call's system is recorded separately so the turn-count
        # assertions in the safety suite stay about turns, while the closing
        # call's carriage of the hard rules can still be asserted (9.2).
        self.seen_rubric_systems: list[str] = []
        self.seen_turns: list[list[Turn]] = []
        self.seen_figures: list[list[bytes]] = []

    def usage(self) -> TokenUsage:
        """Recorded replays spend nothing, like every other recorded seam on
        the platform (the accounting rows come out zero in tests)."""
        return TokenUsage()

    async def stream_reply(
        self,
        system: str,
        turns: list[Turn],
        *,
        figures: list[bytes],
        model_id: str,
    ) -> AsyncIterator[str]:
        self.seen_systems.append(system)
        self.seen_turns.append(list(turns))
        self.seen_figures.append(list(figures))
        index = self.reply_calls
        self.reply_calls += 1
        if index >= len(self._replies):
            raise KeyError("no recorded tutor reply left in the script")
        reply = self._replies[index]
        # Stream in small chunks so the loop's chunk handling is exercised.
        for start in range(0, len(reply), 24):
            yield reply[start : start + 24]

    async def close_rubric(
        self,
        system: str,
        turns: list[Turn],
        rubric_prompt: str,
        *,
        figures: list[bytes],
        model_id: str,
    ) -> str:
        self.seen_rubric_systems.append(system)
        index = self.rubric_calls
        self.rubric_calls += 1
        if index >= len(self._rubrics):
            raise KeyError("no recorded rubric response left in the script")
        return self._rubrics[index]

    @classmethod
    def from_dir(cls, directory: Path) -> "RecordedTutor":
        """Load a scripted session from a directory: replies.json (an array
        of reply strings) and rubrics.json (an array of raw verdict texts)."""
        replies = json.loads((directory / "replies.json").read_text(encoding="utf-8"))
        rubrics = json.loads((directory / "rubrics.json").read_text(encoding="utf-8"))
        return cls(replies=list(replies), rubrics=list(rubrics))


def transcript_fingerprint(turns: list[Turn]) -> str:
    """A stable id for a scripted conversation, for recorded assets."""
    return hashlib.sha256(
        json.dumps([t.model_dump() for t in turns], sort_keys=True).encode()
    ).hexdigest()


def get_tutor() -> Tutor:
    """The live tutor; tests inject a recorded one."""
    return AnthropicTutor()
