"""Milestone 1.1: the pragma helper is the only door to SQLite, and every
connection it opens carries exactly the configuration of backend guide 3.2."""

import sqlite3
from pathlib import Path

import pytest

from app.db.connection import PRAGMAS, connect


def _pragma(conn: sqlite3.Connection, name: str) -> object:
    return conn.execute(f"PRAGMA {name}").fetchone()[0]


def test_writer_connection_has_exact_pragma_set(tmp_path: Path) -> None:
    conn = connect(tmp_path / "shard.db")
    try:
        assert _pragma(conn, "journal_mode") == "wal"
        assert _pragma(conn, "synchronous") == 1  # NORMAL
        assert _pragma(conn, "cache_size") == -64000
        assert _pragma(conn, "mmap_size") == 268435456
        assert _pragma(conn, "busy_timeout") == 5000
        assert _pragma(conn, "foreign_keys") == 1
        assert _pragma(conn, "temp_store") == 2  # MEMORY
    finally:
        conn.close()


def test_pragma_constant_matches_guide() -> None:
    """The helper's configuration is the guide's, verbatim; a drive-by edit
    to one pragma value must fail a test, not slip through."""
    assert PRAGMAS == {
        "journal_mode": "WAL",
        "synchronous": "NORMAL",
        "cache_size": "-64000",
        "mmap_size": "268435456",
        "busy_timeout": "5000",
        "foreign_keys": "ON",
        "temp_store": "MEMORY",
    }


def test_readonly_connection_rejects_writes(tmp_path: Path) -> None:
    path = tmp_path / "shard.db"
    writer = connect(path)
    writer.execute("CREATE TABLE t (x INTEGER)")
    ro = connect(path, readonly=True)
    try:
        with pytest.raises(sqlite3.OperationalError):
            ro.execute("INSERT INTO t VALUES (1)")
        assert ro.execute("SELECT COUNT(*) FROM t").fetchone()[0] == 0
    finally:
        ro.close()
        writer.close()


def test_readonly_requires_existing_file(tmp_path: Path) -> None:
    with pytest.raises(sqlite3.OperationalError):
        connect(tmp_path / "absent.db", readonly=True)


def test_connections_are_autocommit(tmp_path: Path) -> None:
    """The writer queue owns transactions explicitly; the helper must not
    leave Python's implicit transaction management in play."""
    conn = connect(tmp_path / "shard.db")
    try:
        assert conn.isolation_level is None
    finally:
        conn.close()
