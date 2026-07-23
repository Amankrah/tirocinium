"""Milestone 1.1: one writer per shard behind an async queue. Writes are
serialized, transactional, and a failure rolls back without wedging the
queue."""

import asyncio
import sqlite3
import time
from pathlib import Path

import pytest

from app.db.connection import connect
from app.db.writer import ShardWriter


@pytest.fixture()
def writer(tmp_path: Path) -> ShardWriter:
    conn = connect(tmp_path / "shard.db")
    conn.execute("CREATE TABLE counter (id INTEGER PRIMARY KEY, n INTEGER NOT NULL)")
    conn.execute("INSERT INTO counter VALUES (1, 0)")
    return ShardWriter(conn)


async def test_concurrent_writes_serialize(writer: ShardWriter) -> None:
    """Twenty concurrent read-modify-write increments with a deliberate gap
    between read and write. Any interleaving loses updates; the queue must
    lose none."""

    def increment(conn: sqlite3.Connection) -> None:
        (n,) = conn.execute("SELECT n FROM counter WHERE id = 1").fetchone()
        time.sleep(0.002)
        conn.execute("UPDATE counter SET n = ? WHERE id = 1", (n + 1,))

    await asyncio.gather(*(writer.run(increment) for _ in range(20)))
    assert await writer.run(
        lambda c: c.execute("SELECT n FROM counter WHERE id = 1").fetchone()[0]
    ) == 20


async def test_failure_rolls_back_and_queue_survives(writer: ShardWriter) -> None:
    def poison(conn: sqlite3.Connection) -> None:
        conn.execute("UPDATE counter SET n = 999 WHERE id = 1")
        raise RuntimeError("mid-transaction crash")

    with pytest.raises(RuntimeError):
        await writer.run(poison)

    # The partial write is gone and the writer still serves.
    assert await writer.run(
        lambda c: c.execute("SELECT n FROM counter WHERE id = 1").fetchone()[0]
    ) == 0


async def test_run_returns_value(writer: ShardWriter) -> None:
    assert await writer.run(lambda c: 41 + 1) == 42


async def test_fn_managing_transactions_is_rejected(writer: ShardWriter) -> None:
    """The queue owns the transaction; an fn that commits or rolls back
    itself is misuse and must fail loudly, not corrupt the discipline."""
    with pytest.raises(RuntimeError, match="must not"):
        await writer.run(lambda c: c.execute("COMMIT"))
    # And the queue still serves afterwards.
    assert await writer.run(
        lambda c: c.execute("SELECT n FROM counter WHERE id = 1").fetchone()[0]
    ) == 0
