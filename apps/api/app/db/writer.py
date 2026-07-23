"""The single-writer queue (backend guide 3.2): one dedicated writer
connection per shard, writes serialized explicitly instead of colliding on
busy_timeout.

Work is submitted as a plain function of the connection and runs inside an
explicit transaction on a worker thread; the asyncio lock in front of it is
the queue (waiters wake in FIFO order). BEGIN IMMEDIATE takes the write lock
up front so a queued write never discovers contention halfway through.
"""

import asyncio
import sqlite3
from collections.abc import Callable
from typing import TypeVar

T = TypeVar("T")


class ShardWriter:
    """Owns a shard's one writer connection. All mutations go through run()."""

    def __init__(self, conn: sqlite3.Connection):
        self._conn = conn
        self._lock = asyncio.Lock()

    async def run(self, fn: Callable[[sqlite3.Connection], T]) -> T:
        """Execute fn(conn) inside a transaction, serialized with every other
        write on this shard. Returns fn's result; on any exception the
        transaction rolls back and the exception propagates.

        fn must not manage transactions itself: no BEGIN, COMMIT, ROLLBACK,
        and no executescript (which implicitly commits). The queue owns the
        transaction; fn owns the statements."""
        async with self._lock:
            return await asyncio.to_thread(self._transact, fn)

    def _transact(self, fn: Callable[[sqlite3.Connection], T]) -> T:
        self._conn.execute("BEGIN IMMEDIATE")
        try:
            result = fn(self._conn)
        except BaseException:
            if self._conn.in_transaction:
                self._conn.execute("ROLLBACK")
            raise
        if not self._conn.in_transaction:
            raise RuntimeError(
                "writer fn ended the transaction itself; fn must not use"
                " BEGIN, COMMIT, ROLLBACK, or executescript"
            )
        self._conn.execute("COMMIT")
        return result

    def close(self) -> None:
        self._conn.execute("PRAGMA optimize")
        self._conn.close()
