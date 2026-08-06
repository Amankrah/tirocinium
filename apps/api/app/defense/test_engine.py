"""Milestone 7.2: the real-time turn loop, transport-agnostic. Turn-taking is
server-side, so these tests drive the engine directly: the recognizer's
endpointing closes a student turn, a reply streams text into synthesis with
audio out before the reply is complete, fresh speech cancels a reply in flight
(barge-in), the session winds down before its cap and stops at it, and with no
speech layers at all the same loop runs a typed, captioned session, which is
the graceful degradation of guide 6.5.
"""

import asyncio

from app.defense.conftest import Driver, ScriptedStt, ScriptedTts
from app.defense.engine import WIND_DOWN_NOTE, DefenseEngine, Inbound
from app.defense.model import RecordedTutor
from app.defense.speech import SttEvent

SYSTEM = "You are a tutor.\n\n## The problem\n<<<content\nA circuit.\ncontent>>>"

REPLY_ONE = "Walk me through why you divided twelve by four thousand seven hundred."
REPLY_TWO = "Good. What would change if the supply were doubled?"


async def test_a_typed_turn_gets_a_captioned_reply() -> None:
    """No recognizer and no synthesizer: the typed fallback, which must be the
    same loop rather than a second code path."""
    driver = Driver()
    tutor = RecordedTutor(replies=[REPLY_ONE])
    engine = DefenseEngine(tutor=tutor, system=SYSTEM, tutor_model="m")

    async def script() -> None:
        driver.send(Inbound(kind="text", text="I used Ohm's law."))
        await driver.wait_for("reply_done")
        driver.close()

    runner = asyncio.create_task(engine.run(driver.inbound(), driver.emit))
    await script()
    result = await runner

    assert driver.kinds()[0] == "ready"
    assert driver.kinds()[-1] == "closed"
    assert driver.text_of("reply_text") == REPLY_ONE
    assert [turn.role for turn in result.turns] == ["student", "tutor"]
    assert result.turns[0].text == "I used Ohm's law."
    assert result.turns[1].text == REPLY_ONE
    assert result.ended_by == "end"
    # A captions-only session still measures the turn, so the latency picture
    # does not go blind when speech is unavailable.
    assert len(result.metrics) == 1
    assert result.metrics[0].first_audio_ms is not None
    assert not [event for event in driver.events if event.kind == "audio"]


async def test_endpointing_closes_a_turn_and_audio_streams_back() -> None:
    """The recognizer's endpoint flag is what closes a student turn, and reply
    audio begins before the reply text is complete."""
    driver = Driver()
    tutor = RecordedTutor(replies=[REPLY_ONE])
    stt = ScriptedStt(
        [
            SttEvent(text="I used"),
            SttEvent(text="I used Ohm's law", final=True, endpoint=True),
        ]
    )
    tts = ScriptedTts()
    engine = DefenseEngine(
        tutor=tutor, system=SYSTEM, tutor_model="m", stt=stt, tts=tts
    )

    async def script() -> None:
        driver.send(Inbound(kind="audio", audio=b"\x00\x01" * 160))
        await driver.wait_for("reply_done")
        driver.close()

    runner = asyncio.create_task(engine.run(driver.inbound(), driver.emit))
    await script()
    result = await runner

    assert "partial" in driver.kinds()
    assert result.turns[0].text == "I used Ohm's law"
    assert stt.sessions[0].audio_chunks == [b"\x00\x01" * 160]
    # Audio arrives in chunks as the reply streams, not as one blob at the end.
    audio = [event.audio for event in driver.events if event.kind == "audio"]
    assert len(audio) > 1
    assert b"".join(audio) == b"".join(
        b"audio:" + chunk.encode() for chunk in tts.spoken
    )


async def test_fresh_speech_cancels_the_reply_in_flight() -> None:
    """Barge-in: a student who starts talking over the tutor stops it, the
    provider stream is cancelled rather than merely ignored, and what the tutor
    had said stays in the transcript because the student heard it."""
    driver = Driver()
    tutor = RecordedTutor(replies=[REPLY_ONE])
    stt = ScriptedStt(
        [
            SttEvent(text="I used Ohm's law", final=True, endpoint=True),
            SttEvent(text="actually wait"),
        ],
        delay=0.01,
    )
    tts = ScriptedTts(ttfa=0.25)
    engine = DefenseEngine(
        tutor=tutor, system=SYSTEM, tutor_model="m", stt=stt, tts=tts
    )

    async def script() -> None:
        driver.send(Inbound(kind="audio", audio=b"\x00" * 32))
        await driver.wait_for("interrupted")
        driver.close()

    runner = asyncio.create_task(engine.run(driver.inbound(), driver.emit))
    await script()
    result = await runner

    assert "interrupted" in driver.kinds()
    assert "reply_done" not in driver.kinds()
    assert tts.cancelled == 1
    assert [turn.role for turn in result.turns] == ["student", "tutor"]
    assert REPLY_ONE.startswith(result.turns[1].text)


async def test_the_session_winds_down_then_stops_at_its_cap() -> None:
    """A defence is focused, not endless (guide 6.5): the tutor is told to wind
    down before the cap, and the cap ends the session."""
    driver = Driver()
    tutor = RecordedTutor(replies=[REPLY_ONE, REPLY_TWO, "Let us stop there."])
    engine = DefenseEngine(
        tutor=tutor,
        system=SYSTEM,
        tutor_model="m",
        max_student_turns=3,
        wind_down_before=1,
    )

    async def script() -> None:
        for index, answer in enumerate(["First.", "Second.", "Third."], start=1):
            driver.send(Inbound(kind="text", text=answer))
            await driver.wait_for("reply_done", count=index)

    runner = asyncio.create_task(engine.run(driver.inbound(), driver.emit))
    await script()
    result = await runner

    assert "wind_down" in driver.kinds()
    assert result.ended_by == "cap"
    assert len([turn for turn in result.turns if turn.role == "student"]) == 3
    # The wind-down is instruction, not decoration: it reaches the tutor as
    # part of the system prompt, one turn before the cap and not before.
    assert WIND_DOWN_NOTE not in tutor.seen_systems[0]
    assert WIND_DOWN_NOTE in tutor.seen_systems[1]


async def test_a_session_nobody_speaks_in_closes_cleanly() -> None:
    """Opening a defence and saying nothing must cost no model call: there is
    nothing to reply to, and 7.3 has nothing to judge."""
    driver = Driver()
    tutor = RecordedTutor(replies=[])
    engine = DefenseEngine(tutor=tutor, system=SYSTEM, tutor_model="m")

    runner = asyncio.create_task(engine.run(driver.inbound(), driver.emit))
    await driver.wait_for("ready")
    driver.close()
    result = await runner

    assert result.turns == []
    assert result.metrics == []
    assert tutor.reply_calls == 0
    assert driver.kinds() == ["ready", "closed"]


async def test_the_figures_reach_the_tutor_as_pixels() -> None:
    """Guide 6.5's attach point: the tutor sees the same diagram the student
    worked from, so it can conduct the conversation about it."""
    driver = Driver()
    tutor = RecordedTutor(replies=[REPLY_ONE])
    figure = b"\x89PNG\r\n\x1a\npixels"
    engine = DefenseEngine(
        tutor=tutor, system=SYSTEM, tutor_model="m", figures=[figure]
    )

    runner = asyncio.create_task(engine.run(driver.inbound(), driver.emit))
    driver.send(Inbound(kind="text", text="Look at the loop."))
    await driver.wait_for("reply_done")
    driver.close()
    await runner

    assert tutor.seen_figures == [[figure]]
