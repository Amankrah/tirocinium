"""The shard manager (backend guide 3.1): data/courses/{course_id}.db plus
directory.db, each behind its own writer queue and read pool, migrated at
startup and on first open. Cross-course queries go through the directory or
application-level aggregation; there is no cross-shard SQL anywhere.
"""

import asyncio
from pathlib import Path
from types import TracebackType
from typing import Self

from pydantic import BaseModel, Field

from app.db.connection import connect
from app.db.migrations import apply_migrations
from app.db.pool import ReadPool
from app.db.writer import ShardWriter

_MIGRATIONS_ROOT = Path(__file__).resolve().parent / "migrations"
DIRECTORY_MIGRATIONS = _MIGRATIONS_ROOT / "directory"
COURSE_MIGRATIONS = _MIGRATIONS_ROOT / "course"


class DataConfig(BaseModel):
    """Typed configuration for the data layer."""

    data_dir: Path
    read_pool_size: int = Field(default=4, ge=1, le=32)


class _Shard:
    def __init__(self, path: Path, tree: Path, pool_size: int):
        conn = connect(path)
        apply_migrations(conn, tree)
        self.writer = ShardWriter(conn)
        self._path = path
        self._pool_size = pool_size
        self._pool: ReadPool | None = None

    @property
    def reads(self) -> ReadPool:
        # Lazy: read-only connections require the file, which the writer
        # connection has created by now.
        if self._pool is None:
            self._pool = ReadPool(self._path, self._pool_size)
        return self._pool

    def close(self) -> None:
        if self._pool is not None:
            self._pool.close()
        self.writer.close()


class ShardManager:
    """Owns every open shard. Use as an async context manager; on entry the
    directory is opened and every existing course shard is migrated."""

    def __init__(self, data_dir: Path, read_pool_size: int = 4):
        self._config = DataConfig(data_dir=data_dir, read_pool_size=read_pool_size)
        self._directory: _Shard | None = None
        self._courses: dict[int, _Shard] = {}

    # ------------------------------------------------------------ lifecycle

    async def __aenter__(self) -> Self:
        await asyncio.to_thread(self._startup)
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        self.close()

    def _startup(self) -> None:
        self._directory = _Shard(
            self._config.data_dir / "directory.db",
            DIRECTORY_MIGRATIONS,
            self._config.read_pool_size,
        )
        for path in sorted(self.courses_dir.glob("*.db")):
            if path.stem.isdigit():
                self._open_course(int(path.stem))

    def close(self) -> None:
        for shard in self._courses.values():
            shard.close()
        self._courses.clear()
        if self._directory is not None:
            self._directory.close()
            self._directory = None

    # ------------------------------------------------------------ accessors

    @property
    def courses_dir(self) -> Path:
        return self._config.data_dir / "courses"

    @property
    def directory(self) -> ShardWriter:
        assert self._directory is not None, "ShardManager used before __aenter__"
        return self._directory.writer

    @property
    def directory_reads(self) -> ReadPool:
        assert self._directory is not None, "ShardManager used before __aenter__"
        return self._directory.reads

    def _open_course(self, course_id: int) -> _Shard:
        shard = self._courses.get(course_id)
        if shard is None:
            shard = _Shard(
                self.courses_dir / f"{course_id}.db",
                COURSE_MIGRATIONS,
                self._config.read_pool_size,
            )
            self._courses[course_id] = shard
        return shard

    def course(self, course_id: int) -> ShardWriter:
        """The writer queue for one course shard, opening and migrating the
        shard on first use."""
        return self._open_course(course_id).writer

    def course_reads(self, course_id: int) -> ReadPool:
        return self._open_course(course_id).reads

    def drop_course(self, course_id: int) -> None:
        """Close a course shard and delete its files. The directory row and
        any authorization are the caller's concern; this only reclaims the
        shard file (and its WAL sidecars). Closing first matters on Windows,
        where an open SQLite file cannot be unlinked."""
        shard = self._courses.pop(course_id, None)
        if shard is not None:
            shard.close()
        base = self.courses_dir / f"{course_id}.db"
        for path in (base, base.with_suffix(".db-wal"), base.with_suffix(".db-shm")):
            path.unlink(missing_ok=True)
