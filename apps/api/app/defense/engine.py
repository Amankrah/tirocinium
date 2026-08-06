"""The real-time turn engine (milestone 7.2, backend guide 6.5). Transport
agnostic: the WebSocket route and the latency harness both drive this same
loop, feeding inbound messages (audio chunks, typed text, end-of-turn, end)
and receiving outbound events (STT partials, caption text, audio chunks,
per-turn first-audio metrics). Turn-taking lives here, server-side, so
behaviour is consistent across devices: the provider's endpointing closes a
student turn, a reply streams tutor text into TTS with chunked audio out, and
barge-in (fresh student speech or text while a reply is playing) cancels the
reply mid-stream.

The engine holds the conversation in memory and returns the transcript and
metrics; persistence, the rubric, and evidence are the close flow's
(app.defense.close). Raw audio passes through and is never kept.

Degradation is structural: with no TTS the reply is captions only, with no
STT the session is typed only, and the same loop serves both, which is the
graceful-degradation posture of guide 6.5. A provider that dies mid-session
degrades into exactly those modes and says so once (speech_down, audio_down),
because a client cannot tell a dead recognizer from a quiet student.
"""

import asyncio
import time
from collections.abc import AsyncIterator, Awaitable, Callable

from pydantic import BaseModel, Field

from app.defense.model import Turn, Tutor
from app.defense.speech import SpeechSession, SpeechToText, TextToSpeech

# Caps (guide 6.5: a defence should be focused, not endless). The wind-down
# begins two student turns before the cap; at the cap the session closes.
MAX_STUDENT_TURNS = 12
WIND_DOWN_BEFORE = 2

WIND_DOWN_NOTE = (
    "\n\nThe session is winding down: bring the current thread to a close in"
    " one or two turns, then name the one concept most worth revisiting and"
    " offer a fresh variant on it."
)


class Inbound(BaseModel, frozen=True):
    """One message from the transport. Exactly one field is meaningful:
    kind 'audio' carries bytes, 'text' carries a typed turn, 'end_turn'
    forces an endpoint (push-to-talk release), 'end' closes the session."""

    kind: str  # 'audio' | 'text' | 'end_turn' | 'end'
    audio: bytes = b""
    text: str = ""


class Outbound(BaseModel, frozen=True):
    """One event to the transport. kind 'audio' carries reply audio bytes;
    everything else is JSON control for the client."""

    kind: str
    # 'ready' | 'partial' | 'turn' | 'reply_text' | 'audio' | 'reply_done'
    # | 'interrupted' | 'wind_down' | 'speech_down' | 'audio_down' | 'closed'
    text: str = ""
    audio: bytes = b""
    first_audio_ms: int | None = None


class TurnMetric(BaseModel, frozen=True):
    """Per-turn instrumentation for the 800 ms first-audio target."""

    turn: int
    first_audio_ms: int | None


class EngineResult(BaseModel, frozen=True):
    turns: list[Turn] = Field(default_factory=list)
    metrics: list[TurnMetric] = Field(default_factory=list)
    ended_by: str = "end"  # 'end' | 'cap' | 'disconnect'


Emit = Callable[[Outbound], Awaitable[None]]


class DefenseEngine:
    def __init__(
        self,
        *,
        tutor: Tutor,
        system: str,
        tutor_model: str,
        figures: list[bytes] | None = None,
        stt: SpeechToText | None = None,
        tts: TextToSpeech | None = None,
        max_student_turns: int = MAX_STUDENT_TURNS,
        wind_down_before: int = WIND_DOWN_BEFORE,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._tutor = tutor
        self._system = system
        self._tutor_model = tutor_model
        self._figures = list(figures or [])
        self._stt = stt
        self._tts = tts
        self._max_turns = max_student_turns
        self._wind_down_at = max_student_turns - wind_down_before
        self._clock = clock
        self.turns: list[Turn] = []
        self.metrics: list[TurnMetric] = []
        self._student_turns = 0
        self._wound_down = False

    async def run(self, inbound: AsyncIterator[Inbound], emit: Emit) -> EngineResult:
        await emit(Outbound(kind="ready"))
        queue: asyncio.Queue[tuple[str, str]] = asyncio.Queue()
        session: SpeechSession | None = None
        pumps: list[asyncio.Task[None]] = []
        reply_task: asyncio.Task[None] | None = None

        if self._stt is not None:
            session = await self._stt.connect()
            pumps.append(asyncio.create_task(self._pump_stt(session, queue, emit)))
        pumps.append(
            asyncio.create_task(self._pump_inbound(inbound, session, queue))
        )

        ended_by = "disconnect"
        try:
            while True:
                kind, text = await queue.get()
                if kind == "end":
                    ended_by = "end"
                    break
                if kind == "barge":
                    # Fresh speech while a reply is playing: cancel it.
                    if reply_task is not None and not reply_task.done():
                        reply_task.cancel()
                        await _swallow(reply_task)
                        await emit(Outbound(kind="interrupted"))
                    continue
                if kind != "student":
                    continue
                if reply_task is not None and not reply_task.done():
                    reply_task.cancel()
                    await _swallow(reply_task)
                    await emit(Outbound(kind="interrupted"))
                if reply_task is not None:
                    await _swallow(reply_task)
                turn_started = self._clock()
                self._student_turns += 1
                self.turns.append(Turn(role="student", text=text, at=int(time.time())))
                await emit(Outbound(kind="turn", text=text))
                if (
                    not self._wound_down
                    and self._student_turns >= self._wind_down_at
                ):
                    self._wound_down = True
                    await emit(Outbound(kind="wind_down"))
                reply_task = asyncio.create_task(
                    self._reply(turn_started, emit)
                )
                if self._student_turns >= self._max_turns:
                    await _swallow(reply_task)
                    ended_by = "cap"
                    break
        finally:
            if reply_task is not None and not reply_task.done():
                reply_task.cancel()
                await _swallow(reply_task)
            for pump in pumps:
                pump.cancel()
                await _swallow(pump)
        await emit(Outbound(kind="closed"))
        return EngineResult(
            turns=list(self.turns), metrics=list(self.metrics), ended_by=ended_by
        )

    # ------------------------------------------------------------- internals

    async def _pump_inbound(
        self,
        inbound: AsyncIterator[Inbound],
        session: SpeechSession | None,
        queue: asyncio.Queue[tuple[str, str]],
    ) -> None:
        async for message in inbound:
            if message.kind == "audio" and session is not None:
                await session.push_audio(message.audio)
            elif message.kind == "text":
                # The typed fallback (guide 6.5): a text turn is a turn like
                # any other; the student handler interrupts a playing reply.
                await queue.put(("student", message.text))
            elif message.kind == "end_turn" and session is not None:
                await session.finish()
            elif message.kind == "end":
                await queue.put(("end", ""))
                return
        await queue.put(("end", ""))

    async def _pump_stt(
        self,
        session: SpeechSession,
        queue: asyncio.Queue[tuple[str, str]],
        emit: Emit,
    ) -> None:
        utterance: list[str] = []
        try:
            async for event in session.events():
                if not event.final:
                    if event.text:
                        await queue.put(("barge", ""))
                        await emit(Outbound(kind="partial", text=event.text))
                    continue
                if event.text:
                    utterance.append(event.text)
                if event.endpoint:
                    text = " ".join(part for part in utterance if part).strip()
                    utterance = []
                    if text:
                        await queue.put(("student", text))
        except asyncio.CancelledError:
            raise
        except Exception:
            # The recognizer's stream died (a dropped provider socket, a
            # revoked microphone). The session survives as a typed one, which
            # is only useful if the client is told: silence is indistinguishable
            # from a student saying nothing.
            await emit(Outbound(kind="speech_down"))

    async def _reply(self, turn_started: float, emit: Emit) -> None:
        first_audio_ms: int | None = None
        spoken: list[str] = []
        text_queue: asyncio.Queue[str | None] = asyncio.Queue()

        async def text_chunks() -> AsyncIterator[str]:
            while True:
                chunk = await text_queue.get()
                if chunk is None:
                    return
                yield chunk

        async def speak() -> None:
            nonlocal first_audio_ms
            assert self._tts is not None
            async for audio in self._tts.stream(text_chunks()):
                if first_audio_ms is None:
                    first_audio_ms = int((self._clock() - turn_started) * 1000)
                await emit(Outbound(kind="audio", audio=audio))

        speak_task = (
            asyncio.create_task(speak()) if self._tts is not None else None
        )
        system = self._system + (WIND_DOWN_NOTE if self._wound_down else "")
        try:
            async for chunk in self._tutor.stream_reply(
                system,
                list(self.turns),
                figures=self._figures,
                model_id=self._tutor_model,
            ):
                spoken.append(chunk)
                await emit(Outbound(kind="reply_text", text=chunk))
                if speak_task is not None:
                    await text_queue.put(chunk)
            if speak_task is not None:
                await text_queue.put(None)
                try:
                    await speak_task
                except Exception:
                    # Synthesis died mid-reply. The reply itself is intact as
                    # captions, so the turn is kept and the rest of the session
                    # runs without audio rather than ending.
                    self._tts = None
                    await emit(Outbound(kind="audio_down"))
            # A captions-only session measures first caption instead, so the
            # metric stays meaningful in the typed fallback.
            if first_audio_ms is None and spoken:
                first_audio_ms = int((self._clock() - turn_started) * 1000)
        except asyncio.CancelledError:
            if speak_task is not None:
                speak_task.cancel()
                await _swallow(speak_task)
            if spoken:
                self.turns.append(
                    Turn(role="tutor", text="".join(spoken), at=int(time.time()))
                )
            raise
        self.turns.append(Turn(role="tutor", text="".join(spoken), at=int(time.time())))
        self.metrics.append(
            TurnMetric(turn=self._student_turns, first_audio_ms=first_audio_ms)
        )
        await emit(Outbound(kind="reply_done", first_audio_ms=first_audio_ms))


async def _swallow(task: asyncio.Task[None]) -> None:
    try:
        await task
    except (asyncio.CancelledError, Exception):
        return
