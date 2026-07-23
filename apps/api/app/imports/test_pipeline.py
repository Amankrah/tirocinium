"""Milestone 4.1 decode pipeline tests. The pipeline is driven with a fake
decoder (canned pages, so no real PDF or native library), a fake preprocess,
and a recorded-response transcriber for scanned pages (model calls in tests are
always recorded, never live). Covers the born-digital and scanned paths, the
content-hash cache, and the page-count ceiling."""

import hashlib
import io
import json
import sqlite3
from pathlib import Path
from typing import Any

import pytest

from app.compression import decompress_text
from app.db.shards import ShardManager
from app.imports.decoder import DecodedPage, FakePdfDecoder
from app.imports.pipeline import (
    STATUS_FAILED,
    STATUS_READY,
    run_import_pipeline,
)
from app.storage import IMPORTS_BUCKET
from app.transcription.model import PageTranscription, RecordedTranscriber


class FakeStorage:
    def __init__(self) -> None:
        self.objects: dict[tuple[str, str], bytes] = {}

    def create_bucket(self, *, Bucket: str) -> object:
        return {}

    def put_object(self, *, Bucket: str, Key: str, Body: Any) -> object:
        self.objects[(Bucket, Key)] = Body.read() if hasattr(Body, "read") else bytes(Body)
        return {}

    def get_object(self, *, Bucket: str, Key: str) -> Any:
        return {"Body": io.BytesIO(self.objects[(Bucket, Key)])}

    def generate_presigned_url(
        self, ClientMethod: str, Params: dict[str, str], ExpiresIn: int
    ) -> str:
        return "https://storage.test/unused"


def fake_preprocess_ok(data: bytes) -> tuple[bytes, bytes, str]:
    metrics = json.dumps({"blur_score": 120.0})
    return b"gray:" + data, b"bin:" + data, metrics


def _recorded(gray_bytes: bytes, markdown: str) -> dict[str, PageTranscription]:
    key = hashlib.sha256(gray_bytes).hexdigest()
    return {key: PageTranscription(markdown=markdown, confidence=0.9)}


async def _seed_job(
    shards: ShardManager, storage: FakeStorage, storage_key: str, *, course_id: int = 1
) -> int:
    def create(conn: sqlite3.Connection) -> int:
        cur = conn.execute(
            "INSERT INTO import_jobs (course_id, storage_key, status, created_at)"
            " VALUES (?, ?, 'uploaded', 0)",
            (course_id, storage_key),
        )
        assert cur.lastrowid is not None
        return int(cur.lastrowid)

    import_id = await shards.course(course_id).run(create)
    storage.objects[(IMPORTS_BUCKET, storage_key)] = b"%PDF-fake"
    return import_id


async def test_decode_born_digital_and_scanned_pages(tmp_path: Path) -> None:
    storage = FakeStorage()
    pages = [
        DecodedPage(
            page_index=0,
            kind="born_digital",
            text_markdown="# Problem 1\n\nCompute the NPV.",
            image_png=b"img-0",
        ),
        DecodedPage(page_index=1, kind="scanned", text_markdown=None, image_png=b"img-1"),
    ]
    decoder = FakePdfDecoder(pages)
    transcriber = RecordedTranscriber(_recorded(b"gray:img-1", "scanned page text"))

    async with ShardManager(tmp_path) as shards:
        import_id = await _seed_job(shards, storage, "imports/1/abc/source.pdf")

        status = await run_import_pipeline(
            shards=shards,
            storage=storage,
            decoder=decoder,
            transcriber=transcriber,
            course_id=1,
            import_id=import_id,
            preprocess=fake_preprocess_ok,
        )

        def read(
            conn: sqlite3.Connection,
        ) -> tuple[str, int, int, list[tuple[int, str, str]]]:
            job = conn.execute(
                "SELECT status, page_count FROM import_jobs WHERE id = ?", (import_id,)
            ).fetchone()
            docs = conn.execute("SELECT COUNT(*) FROM page_documents").fetchone()[0]
            rows = conn.execute(
                "SELECT ip.page_index, ip.kind, pd.markdown_z"
                " FROM import_pages ip JOIN page_documents pd"
                " ON ip.content_hash = pd.content_hash"
                " WHERE ip.job_id = ? ORDER BY ip.page_index",
                (import_id,),
            ).fetchall()
            decoded = [
                (int(r[0]), str(r[1]), decompress_text(conn, "problem_text", bytes(r[2])))
                for r in rows
            ]
            return str(job[0]), int(job[1]), int(docs), decoded

        job_status, page_count, docs, decoded = await shards.course_reads(1).run(read)

    assert status == STATUS_READY
    assert job_status == "ready"
    assert page_count == 2
    assert docs == 2
    assert decoded[0] == (0, "born_digital", "# Problem 1\n\nCompute the NPV.")
    assert decoded[1] == (1, "scanned", "scanned page text")
    assert (IMPORTS_BUCKET, "imports/1/abc/pages/0.png") in storage.objects
    assert (IMPORTS_BUCKET, "imports/1/abc/pages/1.png") in storage.objects
    assert transcriber.calls == 1  # only the scanned page hit the model


async def test_decode_reuses_the_content_hash_cache(tmp_path: Path) -> None:
    storage = FakeStorage()
    page = DecodedPage(page_index=0, kind="scanned", text_markdown=None, image_png=b"same")
    transcriber = RecordedTranscriber(_recorded(b"gray:same", "read once"))

    async with ShardManager(tmp_path) as shards:
        first = await _seed_job(shards, storage, "imports/1/a/source.pdf")
        await run_import_pipeline(
            shards=shards,
            storage=storage,
            decoder=FakePdfDecoder([page]),
            transcriber=transcriber,
            course_id=1,
            import_id=first,
            preprocess=fake_preprocess_ok,
        )
        assert transcriber.calls == 1

        # A second job whose page is byte-identical: same content hash, so the
        # cache serves it and the (empty) transcriber is never consulted.
        second = await _seed_job(shards, storage, "imports/1/b/source.pdf")
        empty = RecordedTranscriber({})
        status = await run_import_pipeline(
            shards=shards,
            storage=storage,
            decoder=FakePdfDecoder([page]),
            transcriber=empty,
            course_id=1,
            import_id=second,
            preprocess=fake_preprocess_ok,
        )

    assert status == STATUS_READY
    assert empty.calls == 0


async def test_over_page_limit_fails_the_job(tmp_path: Path) -> None:
    storage = FakeStorage()
    pages = [
        DecodedPage(
            page_index=i, kind="born_digital", text_markdown="x", image_png=bytes([i % 256])
        )
        for i in range(201)
    ]

    async with ShardManager(tmp_path) as shards:
        import_id = await _seed_job(shards, storage, "imports/1/big/source.pdf")

        with pytest.raises(ValueError, match="over the 200 page limit"):
            await run_import_pipeline(
                shards=shards,
                storage=storage,
                decoder=FakePdfDecoder(pages),
                transcriber=RecordedTranscriber({}),
                course_id=1,
                import_id=import_id,
                preprocess=fake_preprocess_ok,
            )

        status = await shards.course_reads(1).run(
            lambda conn: str(
                conn.execute(
                    "SELECT status FROM import_jobs WHERE id = ?", (import_id,)
                ).fetchone()[0]
            )
        )
        pages_stored = [k for k in storage.objects if k[1].endswith(".png")]

    assert status == STATUS_FAILED
    assert pages_stored == []  # the ceiling trips before any page is written


async def test_missing_job_returns_failed(tmp_path: Path) -> None:
    storage = FakeStorage()
    async with ShardManager(tmp_path) as shards:
        # Touch the shard so migrations apply, then decode a non-existent job.
        await _seed_job(shards, storage, "imports/1/x/source.pdf")
        status = await run_import_pipeline(
            shards=shards,
            storage=storage,
            decoder=FakePdfDecoder([]),
            transcriber=RecordedTranscriber({}),
            course_id=1,
            import_id=999999,
            preprocess=fake_preprocess_ok,
        )
    assert status == STATUS_FAILED
