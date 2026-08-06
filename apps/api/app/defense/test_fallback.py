"""The Phase 7 fallback gate: audio killed mid-session degrades to text
without losing context.

Two ways audio dies, and neither may end the defence. When the recognizer's
stream drops, the session continues as a typed one and the client is told, so
it can offer the keyboard instead of showing a microphone that hears nothing.
When synthesis dies mid-reply, the reply survives as captions, the tutor's turn
still enters the transcript, and the rest of the session runs silently rather
than stopping. In both cases the conversation the tutor sees on the next turn
is the whole conversation, including the turns that happened in the other
mode: that is what "without losing context" means, and it is the thing a
student would actually notice.
"""

import asyncio
from collections.abc import AsyncIterator
from pathlib import Path

from app.db.shards import ShardManager
from app.defense.close import close_conversation
from app.defense.conftest import (
    Driver,
    FakeStorage,
    ScriptedSttSession,
    ScriptedTts,
    build_context,
)
from app.defense.engine import DefenseEngine, Inbound
from app.defense.model import RecordedTutor
from app.defense.speech import SpeechSession, SttEvent

SYSTEM = "You are a tutor."

REPLY_ONE = "Why did you divide twelve by four thousand seven hundred?"
REPLY_TWO = "Good. What would change if the supply were doubled?"
REPLY_THREE = "And which of those two steps are you least sure of?"

TYPED_TURN = "The keyboard works, so: because the loop current is common."

VERDICT = """{
  "concepts": [{"concept_id": 7, "reasoning": 2, "gap": null}],
  "concept_to_revisit": 7,
  "session_confidence": 0.7
}"""


class DyingSttSession(ScriptedSttSession):
    """A recognizer whose socket drops after its scripted utterance, the way a
    provider stream ends when the network goes: not with a final event."""

    async def events(self) -> AsyncIterator[SttEvent]:
        async for event in super().events():
            yield event
            if event.endpoint:
                raise ConnectionError("recognizer stream closed by the provider")


class DyingStt:
    def __init__(self, script: list[SttEvent]) -> None:
        self._script = script
        self.sessions: list[DyingSttSession] = []

    @property
    def provider(self) -> str:
        return "dying-stt"

    async def connect(self, *, language: str = "en") -> SpeechSession:
        session = DyingSttSession(self._script)
        self.sessions.append(session)
        return session


class DyingTts(ScriptedTts):
    """Synthesis that works, then stops working: the nth stream raises before
    its first chunk, as a provider does when it rejects or drops a connection."""

    def __init__(self, *, fail_on: int) -> None:
        super().__init__()
        self._fail_on = fail_on
        self.calls = 0

    async def stream(
        self, text_chunks: AsyncIterator[str], *, voice: str | None = None
    ) -> AsyncIterator[bytes]:
        self.calls += 1
        if self.calls >= self._fail_on:
            raise ConnectionError("synthesis refused the connection")
        async for chunk in super().stream(text_chunks, voice=voice):
            yield chunk


async def test_a_dead_recognizer_becomes_a_typed_session_with_its_context(
    tmp_path: Path,
) -> None:
    driver = Driver()
    tutor = RecordedTutor(replies=[REPLY_ONE, REPLY_TWO], rubrics=[VERDICT])
    stt = DyingStt([SttEvent(text="I used Ohm's law", final=True, endpoint=True)])
    tts = ScriptedTts()
    storage = FakeStorage()

    async with ShardManager(tmp_path) as shards:
        context = await build_context(shards, storage)
        engine = DefenseEngine(
            tutor=tutor,
            system=context.system,
            tutor_model="recorded",
            figures=context.figures,
            stt=stt,
            tts=tts,
        )

        async def script() -> None:
            driver.send(Inbound(kind="audio", audio=b"\x00\x01" * 160))
            await driver.wait_for("reply_done")
            await driver.wait_for("speech_down")
            driver.send(Inbound(kind="text", text=TYPED_TURN))
            await driver.wait_for("reply_done", count=2)
            driver.close()

        runner = asyncio.create_task(engine.run(driver.inbound(), driver.emit))
        await script()
        result = await runner

        closed = await close_conversation(
            shards=shards,
            tutor=tutor,
            course_id=1,
            context=context,
            turns=result.turns,
        )

    # The client heard about it once, and the session did not end.
    assert driver.kinds().count("speech_down") == 1
    assert driver.kinds()[-1] == "closed"
    assert result.ended_by == "end"
    # The spoken turn and the typed turn are one conversation, in order.
    assert [turn.role for turn in result.turns] == [
        "student",
        "tutor",
        "student",
        "tutor",
    ]
    assert result.turns[0].text == "I used Ohm's law"
    assert result.turns[2].text == TYPED_TURN
    # Context survived the mode switch: the second call carried the first
    # exchange, not just the typed turn.
    assert [turn.text for turn in tutor.seen_turns[1]] == [
        "I used Ohm's law",
        REPLY_ONE,
        TYPED_TURN,
    ]
    # Audio kept flowing for the typed turn, because only the ear died.
    assert [event.kind for event in driver.events].count("audio") >= 2
    assert closed.rubric is not None


async def test_dead_synthesis_keeps_the_reply_as_captions_and_the_turn(
    tmp_path: Path,
) -> None:
    """The dangerous variant: synthesis fails after the tutor has already
    spoken its reply. The text must not be lost with the audio, or the next
    turn would be reasoned from a conversation that never happened."""
    driver = Driver()
    tutor = RecordedTutor(replies=[REPLY_ONE, REPLY_TWO, REPLY_THREE])
    tts = DyingTts(fail_on=2)
    storage = FakeStorage()

    async with ShardManager(tmp_path) as shards:
        context = await build_context(shards, storage)
        engine = DefenseEngine(
            tutor=tutor,
            system=context.system,
            tutor_model="recorded",
            tts=tts,
        )

        async def script() -> None:
            for index, text in enumerate(["First.", "Second.", "Third."], start=1):
                driver.send(Inbound(kind="text", text=text))
                await driver.wait_for("reply_done", count=index)
            driver.close()

        runner = asyncio.create_task(engine.run(driver.inbound(), driver.emit))
        await script()
        result = await runner

    assert driver.kinds().count("audio_down") == 1
    # Every reply is complete as text, including the one whose audio died.
    assert [turn.text for turn in result.turns if turn.role == "tutor"] == [
        REPLY_ONE,
        REPLY_TWO,
        REPLY_THREE,
    ]
    assert driver.text_of("reply_text") == REPLY_ONE + REPLY_TWO + REPLY_THREE
    # Synthesis is not retried on every later turn: one failure, then captions.
    assert tts.calls == 2
    # The turn metric stays populated, so the latency picture does not go blind
    # when a session degrades: captions-only measures the first caption.
    assert len(result.metrics) == 3
    assert all(metric.first_audio_ms is not None for metric in result.metrics)
