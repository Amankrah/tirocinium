"""Milestone 3.3 pipeline tests. The pipeline is driven with a fake preprocess
(so the tests are independent of real image content), an in-memory recording
bus, and a recorded-response transcriber (model calls in tests are always
recorded, never live). Together they cover the happy path, the content-hash
cache, and a page rejection turning the submission into a retake."""

import hashlib
import io
import json
import sqlite3
from collections.abc import AsyncIterator
from contextlib import AbstractAsyncContextManager
from pathlib import Path
from typing import Any

import pytest
from platform_core.preprocess import PageRejected

from app.compression import compress_text, decompress_text
from app.db.shards import ShardManager
from app.events import Event, InMemoryEventBus
from app.storage import SCANS_BUCKET
from app.transcription.model import PageTranscription, RecordedTranscriber, Region
from app.transcription.pipeline import (
    STATUS_NEEDS_RETAKE,
    STATUS_PROCESSED,
    run_submission_pipeline,
)

RECORDED_DIR = Path(__file__).resolve().parents[2] / "tests" / "recorded" / "transcription"


class RecordingBus:
    """Captures every published event; listen is never used by the pipeline."""

    def __init__(self) -> None:
        self.events: list[tuple[str, Event]] = []

    async def publish(self, channel: str, event: Event) -> None:
        self.events.append((channel, event))

    def listen(self, channel: str) -> AbstractAsyncContextManager[AsyncIterator[Event]]:
        raise NotImplementedError

    def types(self) -> list[str]:
        return [str(event["type"]) for _channel, event in self.events]


class FakeStorage:
    def __init__(self) -> None:
        self.objects: dict[tuple[str, str], bytes] = {}

    def create_bucket(self, *, Bucket: str) -> object:
        return {}

    def put_object(self, *, Bucket: str, Key: str, Body: Any) -> object:
        data = Body.read() if hasattr(Body, "read") else bytes(Body)
        self.objects[(Bucket, Key)] = data
        return {}

    def get_object(self, *, Bucket: str, Key: str) -> Any:
        return {"Body": io.BytesIO(self.objects[(Bucket, Key)])}

    def generate_presigned_url(
        self, ClientMethod: str, Params: dict[str, str], ExpiresIn: int
    ) -> str:
        return "https://storage.test/unused"


def fake_preprocess_ok(data: bytes) -> tuple[bytes, bytes, str]:
    """Deterministic renditions keyed to the original bytes, so a page always
    yields the same grayscale image (and therefore the same recorded reading)."""
    metrics = json.dumps({"blur_score": 120.0, "mean_luminance": 200.0})
    return b"gray:" + data, b"bin:" + data, metrics


def reject_preprocess(data: bytes) -> tuple[bytes, bytes, str]:
    raise PageRejected("blurry", "is too blurry, please retake it")


async def _seed(
    shards: ShardManager,
    storage: FakeStorage,
    page_bodies: list[bytes],
    *,
    course_id: int = 1,
    prefix: str = "scans/1/sub",
) -> int:
    def create(conn: sqlite3.Connection) -> int:
        case_study = conn.execute(
            "INSERT INTO case_studies (author_id, title, body_z, status, created_at,"
            " updated_at) VALUES (1, 't', ?, 'draft', 0, 0)",
            (compress_text(conn, "problem_text", "# t"),),
        )
        variant = conn.execute(
            "INSERT INTO variants (case_study_id, seed_json_z, body_z, solution_z,"
            " verification, model_id, created_at)"
            " VALUES (?, ?, ?, ?, 'verified', 'm', 0)",
            (
                case_study.lastrowid,
                compress_text(conn, "problem_text", "{}"),
                compress_text(conn, "problem_text", "b"),
                compress_text(conn, "problem_text", "s"),
            ),
        )
        submission = conn.execute(
            "INSERT INTO submissions (variant_id, seat_id, page_count, storage_prefix,"
            " status, submitted_at) VALUES (?, 1, ?, ?, 'uploaded', 0)",
            (variant.lastrowid, len(page_bodies), prefix),
        )
        submission_id = submission.lastrowid
        assert submission_id is not None
        for index, body in enumerate(page_bodies):
            conn.execute(
                "INSERT INTO submission_pages (submission_id, page_index, storage_key,"
                " content_type, size_bytes) VALUES (?, ?, ?, 'image/jpeg', ?)",
                (submission_id, index, f"{prefix}/{index}", len(body)),
            )
        return int(submission_id)

    submission_id = await shards.course(course_id).run(create)
    for index, body in enumerate(page_bodies):
        storage.objects[(SCANS_BUCKET, f"{prefix}/{index}")] = body
    return submission_id


def _recorded(gray_bytes: bytes, transcription: PageTranscription) -> dict[str, PageTranscription]:
    return {hashlib.sha256(gray_bytes).hexdigest(): transcription}


async def test_pipeline_transcribes_and_aggregates(tmp_path: Path) -> None:
    storage = FakeStorage()
    bus = RecordingBus()
    async with ShardManager(tmp_path) as shards:
        submission_id = await _seed(shards, storage, [b"page-0", b"page-1"])
        transcriber = RecordedTranscriber(
            {
                **_recorded(
                    b"gray:page-0",
                    PageTranscription(
                        markdown="Page zero \\(x^2\\)",
                        confidence=0.9,
                        regions=[Region(bbox=(0, 0, 1, 0.5), confidence=0.9, text="Page zero")],
                    ),
                ),
                **_recorded(
                    b"gray:page-1",
                    PageTranscription(markdown="Page one", confidence=0.7),
                ),
            }
        )

        status = await run_submission_pipeline(
            shards=shards,
            storage=storage,
            transcriber=transcriber,
            bus=bus,
            course_id=1,
            submission_id=submission_id,
            preprocess=fake_preprocess_ok,
        )

        assert status == STATUS_PROCESSED
        assert (SCANS_BUCKET, "scans/1/sub/pre/0.grayscale.png") in storage.objects
        assert (SCANS_BUCKET, "scans/1/sub/pre/0.binarized.png") in storage.objects
        assert (SCANS_BUCKET, "scans/1/sub/pre/1.grayscale.png") in storage.objects

        def read(conn: sqlite3.Connection) -> tuple[int, str, float, str, str, str]:
            cache = int(conn.execute("SELECT COUNT(*) FROM page_transcriptions").fetchone()[0])
            row = conn.execute(
                "SELECT recognized_z, recognition_conf, status FROM submissions WHERE id = ?",
                (submission_id,),
            ).fetchone()
            recognized = decompress_text(conn, "handwriting", bytes(row[0]))
            page0 = conn.execute(
                "SELECT quality_status, content_sha FROM submission_pages"
                " WHERE submission_id = ? AND page_index = 0",
                (submission_id,),
            ).fetchone()
            return cache, recognized, float(row[1]), str(row[2]), str(page0[0]), str(page0[1])

        cache, recognized, confidence, submission_status, quality, content_sha = (
            await shards.course_reads(1).run(read)
        )

    assert cache == 2
    assert "Page zero" in recognized
    assert "Page one" in recognized
    assert confidence == pytest.approx(0.8)
    assert submission_status == "processed"
    assert quality == "ok"
    # The server-computed hash of the original page bytes is stored so the
    # review read can join the page to its cached transcription (migration 0008).
    assert content_sha == hashlib.sha256(b"page-0").hexdigest()
    assert transcriber.calls == 2
    assert bus.types() == ["status", "page", "page", "done"]
    assert bus.events[-1][1]["status"] == "processed"


async def test_pipeline_reuses_the_content_hash_cache(tmp_path: Path) -> None:
    storage = FakeStorage()
    async with ShardManager(tmp_path) as shards:
        first = await _seed(shards, storage, [b"same"], prefix="scans/1/a")
        primed = RecordedTranscriber(
            _recorded(b"gray:same", PageTranscription(markdown="X", confidence=0.5))
        )
        await run_submission_pipeline(
            shards=shards,
            storage=storage,
            transcriber=primed,
            bus=RecordingBus(),
            course_id=1,
            submission_id=first,
            preprocess=fake_preprocess_ok,
        )
        assert primed.calls == 1

        # A second submission with byte-identical pages: same content hash, so
        # the cache serves it and the (empty) transcriber is never consulted.
        second = await _seed(shards, storage, [b"same"], prefix="scans/1/b")
        empty = RecordedTranscriber({})
        status = await run_submission_pipeline(
            shards=shards,
            storage=storage,
            transcriber=empty,
            bus=RecordingBus(),
            course_id=1,
            submission_id=second,
            preprocess=fake_preprocess_ok,
        )

    assert status == STATUS_PROCESSED
    assert empty.calls == 0


async def test_pipeline_marks_needs_retake_when_a_page_is_rejected(tmp_path: Path) -> None:
    storage = FakeStorage()
    bus = RecordingBus()
    async with ShardManager(tmp_path) as shards:
        submission_id = await _seed(shards, storage, [b"page-0", b"page-1"])
        transcriber = RecordedTranscriber({})

        status = await run_submission_pipeline(
            shards=shards,
            storage=storage,
            transcriber=transcriber,
            bus=bus,
            course_id=1,
            submission_id=submission_id,
            preprocess=reject_preprocess,
        )

        def read(conn: sqlite3.Connection) -> tuple[str, str, str]:
            page = conn.execute(
                "SELECT quality_status, reject_reason FROM submission_pages"
                " WHERE submission_id = ? AND page_index = 0",
                (submission_id,),
            ).fetchone()
            submission_status = str(
                conn.execute(
                    "SELECT status FROM submissions WHERE id = ?", (submission_id,)
                ).fetchone()[0]
            )
            return str(page[0]), str(page[1]), submission_status

        quality, reason, submission_status = await shards.course_reads(1).run(read)

    assert status == STATUS_NEEDS_RETAKE
    assert transcriber.calls == 0
    assert quality == "rejected"
    assert reason == "blurry"
    assert submission_status == "needs_retake"
    assert "rejected" in bus.types()
    assert bus.events[-1][1] == {"type": "done", "status": "needs_retake"}


async def test_in_memory_bus_delivers_published_events() -> None:
    import asyncio

    bus = InMemoryEventBus()
    channel = "submission:1:1"
    async with bus.listen(channel) as events:
        await bus.publish(channel, {"type": "page", "page_index": 0})
        received = await asyncio.wait_for(events.__anext__(), timeout=1.0)
    assert received == {"type": "page", "page_index": 0}


def test_recorded_transcriber_loads_committed_assets() -> None:
    transcriber = RecordedTranscriber.from_dir(RECORDED_DIR)
    assert transcriber._responses, "expected at least one recorded response asset"
