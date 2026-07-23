"""The read side (backend guide 3.2): a small pool of read-only connections
per shard. WAL means readers never block the writer and never see a partial
transaction; the pool exists so concurrent reads do not share a connection.
"""

import asyncio
import sqlite3
from collections.abc import Callable
from pathlib import Path
from typing import TypeVar

from app.db.connection import connect

T = TypeVar("T")


class ReadPool:
    """Fixed-size pool of read-only connections to one shard."""

    def __init__(self, path: Path, size: int = 4):
        self._conns: asyncio.Queue[sqlite3.Connection] = asyncio.Queue()
        self._all: list[sqlite3.Connection] = []
        for _ in range(size):
            conn = connect(path, readonly=True)
            self._all.append(conn)
            self._conns.put_nowait(conn)

    async def run(self, fn: Callable[[sqlite3.Connection], T]) -> T:
        conn = await self._conns.get()
        try:
            return await asyncio.to_thread(fn, conn)
        finally:
            self._conns.put_nowait(conn)

    def close(self) -> None:
        for conn in self._all:
            conn.close()
