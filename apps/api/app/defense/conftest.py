"""Shared scaffolding for the Phase 7 suite: a fake object store, a seeded
course shard holding one processed submission on a variant with an essential
figure and two mapped concepts, and the scripted speech fakes the engine and
the latency harness run against.

The speech fakes implement the same Protocols as the real provider adapters
(app.defense.speech_providers), which is what lets the whole loop be tested
without a live provider: recorded responses for the model, scripted timings
for the speech layers.
"""

import asyncio
import hashlib
import io
import json
import sqlite3
from collections.abc import AsyncIterator
from typing import Any

from app.compression import compress_text
from app.db.shards import ShardManager
from app.defense.context import DefenseContext, assemble_context
from app.defense.engine import Inbound, Outbound
from app.defense.speech import SpeechSession, SttEvent
from app.storage import IMPORTS_BUCKET

FIGURE_BYTES = b"\x89PNG\r\n\x1a\nschematic-pixels"
FIGURE_HASH = hashlib.sha256(FIGURE_BYTES).hexdigest()
FIGURE_KEY = "imports/1/figures/schematic.png"

TRANSCRIPTION = "Working: I = V/R = 12/4700.\n\nSo I = 2.553 mA."
REFERENCE_SOLUTION = "By Ohm's law, I = V/R = 12 / 4700 A = 2.553 mA."
FINAL_ANSWER = "2.553 mA"
VARIANT_BODY = "A 12 V supply feeds the circuit. Find the current."

SOLUTION_BLOB = json.dumps(
    {"solution_md": REFERENCE_SOLUTION, "final_answers": [FINAL_ANSWER]}
)

VALID_RUBRIC = json.dumps(
    {
        "concepts": [
            {"concept_id": 7, "reasoning": 2, "gap": "Could not say why V/R gives current"},
            {"concept_id": 8, "reasoning": 3, "gap": None},
        ],
        "concept_to_revisit": 7,
        "session_confidence": 0.9,
    }
)


class FakeStorage:
    def __init__(self) -> None:
        self.objects: dict[tuple[str, str], bytes] = {}

    def create_bucket(self, *, Bucket: str) -> object:
        return {}

    def put_object(self, *, Bucket: str, Key: str, Body: Any) -> object:
        self.objects[(Bucket, Key)] = (
            Body.read() if hasattr(Body, "read") else bytes(Body)
        )
        return {}

    def get_object(self, *, Bucket: str, Key: str) -> Any:
        return {"Body": io.BytesIO(self.objects[(Bucket, Key)])}

    def generate_presigned_url(
        self, ClientMethod: str, Params: dict[str, str], ExpiresIn: int
    ) -> str:
        return "https://storage.test/unused"


def seed_defensible_submission(
    conn: sqlite3.Connection,
    *,
    transcription: str = TRANSCRIPTION,
    solution_blob: str = SOLUTION_BLOB,
    status: str = "processed",
    seat_id: int = 1,
    with_figure: bool = True,
) -> int:
    """One processed submission a student may defend: a variant of a case study
    that maps two concepts (weights 1.0 and 0.3) and carries one essential
    figure."""
    conn.execute("INSERT INTO concepts (id, name, position) VALUES (7, 'Ohm', 1)")
    conn.execute(
        "INSERT INTO concepts (id, name, description, position)"
        " VALUES (8, 'Power', 'P = VI', 2)"
    )
    case = conn.execute(
        "INSERT INTO case_studies (author_id, title, body_z, status, created_at,"
        " updated_at) VALUES (1, 'Circuit', ?, 'published', 0, 0)",
        (compress_text(conn, "problem_text", VARIANT_BODY),),
    )
    case_id = int(case.lastrowid or 0)
    conn.execute(
        "INSERT INTO case_study_concepts (case_study_id, concept_id, weight)"
        " VALUES (?, 7, 1.0)",
        (case_id,),
    )
    conn.execute(
        "INSERT INTO case_study_concepts (case_study_id, concept_id, weight)"
        " VALUES (?, 8, 0.3)",
        (case_id,),
    )
    if with_figure:
        job = conn.execute(
            "INSERT INTO import_jobs (course_id, storage_key, status, created_at)"
            " VALUES (1, 'k', 'confirmed', 0)"
        )
        figure = conn.execute(
            "INSERT INTO figures (content_hash, storage_key, source, width_px,"
            " height_px, created_at) VALUES (?, ?, 'embedded_raster', 40, 30, 0)",
            (FIGURE_HASH, FIGURE_KEY),
        )
        item = conn.execute(
            "INSERT INTO import_items (job_id, question_z, page_span, confidence,"
            " model_id, prompt_version, state, case_study_id)"
            " VALUES (?, ?, '0', 0.9, 'm', 'v1', 'confirmed', ?)",
            (
                int(job.lastrowid or 0),
                compress_text(conn, "problem_text", VARIANT_BODY),
                case_id,
            ),
        )
        conn.execute(
            "INSERT INTO item_figures (item_id, figure_id, role)"
            " VALUES (?, ?, 'essential')",
            (int(item.lastrowid or 0), int(figure.lastrowid or 0)),
        )
    variant = conn.execute(
        "INSERT INTO variants (case_study_id, seed_json_z, body_z, solution_z,"
        " verification, model_id, created_at) VALUES (?, ?, ?, ?, 'verified', 'm', 0)",
        (
            case_id,
            compress_text(conn, "problem_text", "{}"),
            compress_text(conn, "problem_text", VARIANT_BODY),
            compress_text(conn, "problem_text", solution_blob),
        ),
    )
    submission = conn.execute(
        "INSERT INTO submissions (variant_id, seat_id, page_count, storage_prefix,"
        " recognized_z, recognition_conf, status, submitted_at)"
        " VALUES (?, ?, 1, 'p', ?, 0.9, ?, 0)",
        (
            int(variant.lastrowid or 0),
            seat_id,
            compress_text(conn, "handwriting", transcription),
            status,
        ),
    )
    return int(submission.lastrowid or 0)


def open_conversation_row(
    submission_id: int, *, seat_id: int = 1, started_at: int = 0
) -> Any:
    def create(conn: sqlite3.Connection) -> int:
        cursor = conn.execute(
            "INSERT INTO conversations (submission_id, seat_id, status, started_at)"
            " VALUES (?, ?, 'active', ?)",
            (submission_id, seat_id, started_at),
        )
        return int(cursor.lastrowid or 0)

    return create


async def build_context(
    shards: ShardManager, storage: FakeStorage, **kwargs: object
) -> DefenseContext:
    """A seeded course with one open conversation on one defensible
    submission, assembled the way the route assembles it."""
    storage.objects[(IMPORTS_BUCKET, FIGURE_KEY)] = FIGURE_BYTES
    submission_id = await shards.course(1).run(
        lambda conn: seed_defensible_submission(conn, **kwargs)  # type: ignore[arg-type]
    )
    conversation_id = await shards.course(1).run(open_conversation_row(submission_id))
    context = await assemble_context(
        shards=shards,
        storage=storage,
        course_id=1,
        conversation_id=conversation_id,
        submission_id=submission_id,
    )
    assert context is not None
    return context


def evidence(conn: sqlite3.Connection) -> list[tuple[str, int, float, float, float]]:
    return [
        (str(r[0]), int(r[1]), float(r[2]), float(r[3]), float(r[4]))
        for r in conn.execute(
            "SELECT source, concept_id, score, confidence, k FROM evidence_events"
            " ORDER BY concept_id"
        ).fetchall()
    ]


# ------------------------------------------------------------ the transport


class Driver:
    """A transport stand-in: messages in on a queue, events collected, with a
    wait so a test can sequence turns without sleeping on wall-clock time."""

    def __init__(self) -> None:
        self._inbox: asyncio.Queue[Inbound | None] = asyncio.Queue()
        self.events: list[Outbound] = []
        self._arrived = asyncio.Event()

    async def inbound(self) -> AsyncIterator[Inbound]:
        while True:
            message = await self._inbox.get()
            if message is None:
                return
            yield message

    async def emit(self, event: Outbound) -> None:
        self.events.append(event)
        self._arrived.set()

    def send(self, message: Inbound) -> None:
        self._inbox.put_nowait(message)

    def close(self) -> None:
        self._inbox.put_nowait(None)

    def kinds(self) -> list[str]:
        return [event.kind for event in self.events]

    def text_of(self, kind: str) -> str:
        return "".join(event.text for event in self.events if event.kind == kind)

    async def wait_for(
        self, kind: str, *, count: int = 1, timeout: float = 3.0
    ) -> None:
        async def wait() -> None:
            while self.kinds().count(kind) < count:
                self._arrived.clear()
                await self._arrived.wait()

        await asyncio.wait_for(wait(), timeout)


# ------------------------------------------------------------- speech fakes


class ScriptedSttSession:
    """A recognizer session that replays scripted transcript events. Audio
    pushed in is counted, never interpreted: what a real provider hears is not
    what a deterministic test can assert, so the script stands in for it."""

    def __init__(self, script: list[SttEvent], *, delay: float = 0.0) -> None:
        self._script = list(script)
        self._delay = delay
        self.audio_chunks: list[bytes] = []
        self.finished = False
        self._released = asyncio.Event()

    async def push_audio(self, chunk: bytes) -> None:
        self.audio_chunks.append(chunk)
        self._released.set()

    async def events(self) -> AsyncIterator[SttEvent]:
        # Wait for the first audio, so a session with no speech yields nothing
        # and the typed path is genuinely independent of the recognizer.
        await self._released.wait()
        for event in self._script:
            if self._delay:
                await asyncio.sleep(self._delay)
            yield event
        # Then idle for ever, like a live socket with a silent speaker.
        await asyncio.Event().wait()

    async def finish(self) -> None:
        self.finished = True


class ScriptedStt:
    def __init__(self, script: list[SttEvent], *, delay: float = 0.0) -> None:
        self._script = script
        self._delay = delay
        self.sessions: list[ScriptedSttSession] = []

    @property
    def provider(self) -> str:
        return "scripted-stt"

    async def connect(self, *, language: str = "en") -> SpeechSession:
        session = ScriptedSttSession(self._script, delay=self._delay)
        self.sessions.append(session)
        return session


class ScriptedTts:
    """Synthesis as bytes per text chunk, with an injectable time to first
    audio. Cancellation is recorded, which is how the barge-in test proves the
    provider stream was actually stopped rather than merely ignored."""

    def __init__(self, ttfa: float = 0.0) -> None:
        self._ttfa = ttfa
        self.cancelled = 0
        self.spoken: list[str] = []

    @property
    def provider(self) -> str:
        return "scripted-tts"

    async def stream(
        self, text_chunks: AsyncIterator[str], *, voice: str | None = None
    ) -> AsyncIterator[bytes]:
        first = True
        try:
            async for chunk in text_chunks:
                if first and self._ttfa:
                    await asyncio.sleep(self._ttfa)
                first = False
                self.spoken.append(chunk)
                yield b"audio:" + chunk.encode("utf-8")
        except asyncio.CancelledError:
            self.cancelled += 1
            raise
        finally:
            pass
