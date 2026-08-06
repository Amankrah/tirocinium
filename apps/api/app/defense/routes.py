"""The voice defence surface (Phase 7): open a session on your own processed
submission, then stream the conversation over a WebSocket. The socket
authenticates with the seat's opaque token as a query parameter (browsers
cannot set headers on a WebSocket; the token is the same revocable
credential either way), and every session is the seat's own: another seat's
submission is a 404, indistinguishable from absent.

Concurrency is capped per course (guide 6.5); a course at its cap gets an
honest 409, never a queue. The stream itself is the transport shell around
app.defense.engine; when the loop ends, the close flow runs the pinned
rubric call, ingests evidence, and stores the transcript. No audio is
retained anywhere.
"""

import json
import os
import sqlite3
import time
from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    WebSocket,
    WebSocketDisconnect,
)
from pydantic import BaseModel

from app.auth.deps import _seat_identity, get_shards, require_seat
from app.auth.models import Identity
from app.db.shards import ShardManager
from app.defense.close import (
    SessionUsage,
    SpeechSpend,
    close_conversation,
    record_usage,
)
from app.defense.context import assemble_context
from app.defense.engine import DefenseEngine, Inbound, Outbound
from app.defense.model import (
    DEFAULT_RUBRIC_MODEL,
    DEFAULT_TUTOR_MODEL,
    Tutor,
    get_tutor,
)
from app.defense.speech import SpeechToText, TextToSpeech
from app.mastery.params import active_params_json
from app.problems import Problem
from app.storage import ObjectStorage, get_object_storage

router = APIRouter(prefix="/api/v1", tags=["defense"])

# Bytes-per-second of the browser's mono 16 kHz 16-bit PCM stream; the STT
# seconds accounting derives from it until a provider adapter reports exact
# billed seconds.
PCM_BYTES_PER_SECOND = 32_000


def max_concurrent_conversations() -> int:
    return int(os.environ.get("TIRO_DEFENSE_MAX_CONCURRENT", "10"))


def stale_after_seconds() -> int:
    """How long an `active` row may sit before the cap stops counting it. A
    session opened and never streamed (the student closed the tab between the
    POST and the socket) would otherwise hold a slot for ever; the turn cap and
    the wind-down mean no real defence approaches this."""
    return int(os.environ.get("TIRO_DEFENSE_STALE_SECONDS", "3600"))


def get_stt() -> SpeechToText | None:
    """The configured STT adapter, or None (typed-only sessions). The real
    adapter is registered here once the provider integration lands."""
    from app.defense import speech_providers

    return speech_providers.stt_from_env()


def get_tts() -> TextToSpeech | None:
    from app.defense import speech_providers

    return speech_providers.tts_from_env()


class ConversationOut(BaseModel):
    conversation_id: int
    submission_id: int
    status: str
    stream_path: str


@router.post(
    "/submissions/{submission_id}/conversation",
    status_code=201,
    response_model=ConversationOut,
    responses={
        403: {"model": Problem},
        404: {"model": Problem},
        409: {"model": Problem},
    },
)
async def open_conversation(
    submission_id: int,
    identity: Annotated[Identity, Depends(require_seat)],
    shards: Annotated[ShardManager, Depends(get_shards)],
) -> ConversationOut:
    """Open a defence session on the seat's own processed submission."""
    assert identity.course_id is not None and identity.seat_id is not None
    course_id, seat_id = identity.course_id, identity.seat_id
    now = int(time.time())
    cap = max_concurrent_conversations()

    def create(conn: sqlite3.Connection) -> int:
        row = conn.execute(
            "SELECT seat_id, status FROM submissions WHERE id = ?",
            (submission_id,),
        ).fetchone()
        if row is None or int(row[0]) != seat_id:
            raise HTTPException(status_code=404, detail="Submission not found.")
        if str(row[1]) != "processed":
            raise HTTPException(
                status_code=409,
                detail="This submission is still processing; the defence opens"
                " once its transcription is ready.",
            )
        conn.execute(
            "UPDATE conversations SET status = 'abandoned', closed_at = ?"
            " WHERE status = 'active' AND started_at < ?",
            (now, now - stale_after_seconds()),
        )
        active = conn.execute(
            "SELECT COUNT(*) FROM conversations WHERE status = 'active'"
        ).fetchone()
        if int(active[0]) >= cap:
            raise HTTPException(
                status_code=409,
                detail="The course has its maximum number of live conversations"
                " right now; try again in a few minutes.",
            )
        cursor = conn.execute(
            "INSERT INTO conversations (submission_id, seat_id, status, started_at)"
            " VALUES (?, ?, 'active', ?)",
            (submission_id, seat_id, now),
        )
        assert cursor.lastrowid is not None
        return cursor.lastrowid

    conversation_id = await shards.course(course_id).run(create)
    return ConversationOut(
        conversation_id=conversation_id,
        submission_id=submission_id,
        status="active",
        stream_path=f"/api/v1/conversations/{conversation_id}/stream",
    )


async def _ws_inbound(websocket: WebSocket) -> AsyncIterator[Inbound]:
    """Bridge WebSocket frames to engine messages: binary frames are audio,
    JSON text frames are control ({'type': 'text'|'end_turn'|'end'})."""
    try:
        while True:
            message = await websocket.receive()
            if message.get("type") == "websocket.disconnect":
                return
            if (data := message.get("bytes")) is not None:
                yield Inbound(kind="audio", audio=data)
                continue
            text = message.get("text")
            if text is None:
                continue
            try:
                control = json.loads(text)
            except ValueError:
                continue
            kind = str(control.get("type", ""))
            if kind == "text":
                yield Inbound(kind="text", text=str(control.get("text", "")))
            elif kind in ("end_turn", "end"):
                yield Inbound(kind=kind)
                if kind == "end":
                    return
    except WebSocketDisconnect:
        return


@router.websocket("/conversations/{conversation_id}/stream")
async def conversation_stream(
    websocket: WebSocket,
    conversation_id: int,
    token: str | None = None,
    stt: Annotated[SpeechToText | None, Depends(get_stt)] = None,
    tts: Annotated[TextToSpeech | None, Depends(get_tts)] = None,
    tutor: Annotated[Tutor, Depends(get_tutor)] = None,  # type: ignore[assignment]
    storage: Annotated[ObjectStorage, Depends(get_object_storage)] = None,  # type: ignore[assignment]
) -> None:
    shards: ShardManager = websocket.app.state.shards
    if token is None:
        await websocket.close(code=4401)
        return
    try:
        identity = await _seat_identity(token, shards)
    except HTTPException:
        await websocket.close(code=4401)
        return
    assert identity.course_id is not None and identity.seat_id is not None
    course_id, seat_id = identity.course_id, identity.seat_id

    def load(conn: sqlite3.Connection) -> int | None:
        row = conn.execute(
            "SELECT submission_id, seat_id, status FROM conversations WHERE id = ?",
            (conversation_id,),
        ).fetchone()
        if row is None or int(row[1]) != seat_id or str(row[2]) != "active":
            return None
        return int(row[0])

    submission_id = await shards.course_reads(course_id).run(load)
    if submission_id is None:
        await websocket.close(code=4404)
        return

    context = await assemble_context(
        shards=shards,
        storage=storage,
        course_id=course_id,
        conversation_id=conversation_id,
        submission_id=submission_id,
    )
    if context is None:
        await websocket.close(code=4404)
        return

    await websocket.accept()

    audio_bytes_in = 0
    reply_characters = 0

    async def emit(event: Outbound) -> None:
        nonlocal reply_characters
        if event.kind == "audio":
            await websocket.send_bytes(event.audio)
            return
        if event.kind == "reply_text":
            reply_characters += len(event.text)
        payload: dict[str, object] = {"type": event.kind}
        if event.text:
            payload["text"] = event.text
        if event.first_audio_ms is not None:
            payload["first_audio_ms"] = event.first_audio_ms
        await websocket.send_json(payload)

    async def counted_inbound() -> AsyncIterator[Inbound]:
        nonlocal audio_bytes_in
        async for message in _ws_inbound(websocket):
            if message.kind == "audio":
                audio_bytes_in += len(message.audio)
            yield message

    engine = DefenseEngine(
        tutor=tutor,
        system=context.system,
        tutor_model=DEFAULT_TUTOR_MODEL,
        figures=context.figures,
        stt=stt,
        tts=tts,
    )
    result = await engine.run(counted_inbound(), emit)

    conversation_usage = tutor.usage()
    params = await active_params_json(shards)
    closed = await close_conversation(
        shards=shards,
        tutor=tutor,
        course_id=course_id,
        context=context,
        turns=result.turns,
        params_json=params,
    )
    await shards.course(course_id).run(
        record_usage(
            SessionUsage(
                tutor_model=DEFAULT_TUTOR_MODEL,
                tutor=conversation_usage,
                rubric_model=DEFAULT_RUBRIC_MODEL if closed.attempts else None,
                rubric=closed.rubric_usage if closed.attempts else None,
                stt=None
                if stt is None or audio_bytes_in == 0
                else SpeechSpend(
                    provider=stt.provider,
                    unit="seconds",
                    amount=audio_bytes_in / PCM_BYTES_PER_SECOND,
                ),
                tts=None
                if tts is None or reply_characters == 0
                else SpeechSpend(
                    provider=tts.provider,
                    unit="characters",
                    amount=float(reply_characters),
                ),
            )
        )
    )
    try:
        await websocket.send_json(
            {
                "type": "verdict",
                "concept_to_revisit": None
                if closed.rubric is None
                else closed.rubric.concept_to_revisit,
            }
        )
        await websocket.close()
    except (WebSocketDisconnect, RuntimeError):
        return
