"""Milestone 1.2: shard-stored dictionaries and the compression service.
The codec arithmetic itself is property-tested in Rust; these tests cover
the seam: storage, resolution, persistence, and the mixed pre/post-training
case."""

import sqlite3
from pathlib import Path

import pytest

from app.compression import (
    compress_text,
    decompress_text,
    load_dictionary,
    train_and_store_dictionary,
)
from app.db.shards import ShardManager

CORPUS = [
    (
        f"Case study {i}: the discount rate is {4 + i % 8}.{i % 100:02d} percent"
        f" over {4 + i % 5} years of cashflows; compute the net present value."
    ).encode()
    for i in range(200)
]

BODY = (
    "## The expansion decision\n\nThe firm's discount rate is 6.25 percent and"
    " the cashflow horizon is 5 years. Compute the net present value of the"
    " expansion and state whether the project should proceed.\n" * 8
)


async def test_roundtrip_without_dictionary(tmp_path: Path) -> None:
    """A young course has no corpus yet; blobs still compress and roundtrip."""
    async with ShardManager(tmp_path) as mgr:

        def roundtrip(conn: sqlite3.Connection) -> str:
            blob = compress_text(conn, "problem_text", BODY)
            assert len(blob) < len(BODY.encode())
            return decompress_text(conn, "problem_text", blob)

        assert await mgr.course(1).run(roundtrip) == BODY


async def test_trained_dictionary_stored_and_applied(tmp_path: Path) -> None:
    async with ShardManager(tmp_path) as mgr:

        def train_and_use(conn: sqlite3.Connection) -> tuple[int, str, int, int]:
            from platform_core import codec

            dict_id = train_and_store_dictionary(conn, "problem_text", CORPUS)
            with_dict = compress_text(conn, "problem_text", BODY)
            plain = len(codec.compress(BODY.encode()))
            text = decompress_text(conn, "problem_text", with_dict)
            return dict_id, text, len(with_dict), plain

        dict_id, text, with_dict_len, plain_len = await mgr.course(1).run(train_and_use)
        assert dict_id >= 1
        assert text == BODY
        assert with_dict_len <= plain_len


async def test_blob_compressed_before_training_survives_it(tmp_path: Path) -> None:
    """The upgrade path: early blobs are plain frames; training a dictionary
    later must not orphan them."""
    async with ShardManager(tmp_path) as mgr:

        def sequence(conn: sqlite3.Connection) -> str:
            early = compress_text(conn, "problem_text", BODY)
            train_and_store_dictionary(conn, "problem_text", CORPUS)
            return decompress_text(conn, "problem_text", early)

        assert await mgr.course(1).run(sequence) == BODY


async def test_dictionary_persists_across_restart(tmp_path: Path) -> None:
    async with ShardManager(tmp_path) as mgr:

        def setup(conn: sqlite3.Connection) -> bytes:
            train_and_store_dictionary(conn, "handwriting", CORPUS)
            return compress_text(conn, "handwriting", BODY)

        blob = await mgr.course(9).run(setup)

    async with ShardManager(tmp_path) as mgr:
        text = await mgr.course(9).run(
            lambda c: decompress_text(c, "handwriting", blob)
        )
        assert text == BODY
        stored = await mgr.course_reads(9).run(
            lambda c: load_dictionary(c, "handwriting")
        )
        assert stored is not None


async def test_content_types_are_constrained_in_the_shard(tmp_path: Path) -> None:
    """The schema itself rejects an unknown content type; the service's
    Literal type is compile-time, the CHECK constraint is runtime truth."""
    async with ShardManager(tmp_path) as mgr:
        with pytest.raises(sqlite3.IntegrityError):
            await mgr.course(1).run(
                lambda c: c.execute(
                    "INSERT INTO zstd_dictionaries (content_type, dict, trained_at)"
                    " VALUES ('vibes', x'00', 0)"
                )
            )
