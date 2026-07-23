"""Milestone 1.1: numbered migrations, applied in order per shard, recorded,
idempotent, and loud about gaps or divergence."""

import sqlite3
from pathlib import Path

import pytest

from app.db.connection import connect
from app.db.migrations import MigrationError, apply_migrations, migration_files


@pytest.fixture()
def scratch_migrations(tmp_path: Path) -> Path:
    d = tmp_path / "migrations"
    d.mkdir()
    (d / "0001_first.sql").write_text(
        "CREATE TABLE a (id INTEGER PRIMARY KEY);", encoding="utf-8"
    )
    (d / "0002_second.sql").write_text(
        "CREATE TABLE b (id INTEGER PRIMARY KEY);", encoding="utf-8"
    )
    return d


def _tables(conn: sqlite3.Connection) -> set[str]:
    rows = conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
    return {r[0] for r in rows}


def test_fresh_shard_applies_all_in_order(
    tmp_path: Path, scratch_migrations: Path
) -> None:
    conn = connect(tmp_path / "s.db")
    applied = apply_migrations(conn, scratch_migrations)
    assert applied == ["0001_first.sql", "0002_second.sql"]
    assert {"a", "b", "schema_migrations"} <= _tables(conn)
    recorded = [
        r[0]
        for r in conn.execute(
            "SELECT filename FROM schema_migrations ORDER BY filename"
        ).fetchall()
    ]
    assert recorded == ["0001_first.sql", "0002_second.sql"]


def test_rerun_applies_nothing(tmp_path: Path, scratch_migrations: Path) -> None:
    conn = connect(tmp_path / "s.db")
    apply_migrations(conn, scratch_migrations)
    assert apply_migrations(conn, scratch_migrations) == []


def test_new_migration_applies_incrementally(
    tmp_path: Path, scratch_migrations: Path
) -> None:
    conn = connect(tmp_path / "s.db")
    apply_migrations(conn, scratch_migrations)
    (scratch_migrations / "0003_third.sql").write_text(
        "CREATE TABLE c (id INTEGER PRIMARY KEY);", encoding="utf-8"
    )
    assert apply_migrations(conn, scratch_migrations) == ["0003_third.sql"]
    assert "c" in _tables(conn)


def test_unknown_applied_migration_fails(
    tmp_path: Path, scratch_migrations: Path
) -> None:
    """A shard that claims a migration this tree has never heard of is a
    divergence, not something to silently continue past."""
    conn = connect(tmp_path / "s.db")
    apply_migrations(conn, scratch_migrations)
    conn.execute(
        "INSERT INTO schema_migrations (filename, applied_at)"
        " VALUES ('0009_phantom.sql', 0)"
    )
    with pytest.raises(MigrationError, match="phantom"):
        apply_migrations(conn, scratch_migrations)


def test_gap_in_applied_prefix_fails(tmp_path: Path, scratch_migrations: Path) -> None:
    conn = connect(tmp_path / "s.db")
    apply_migrations(conn, scratch_migrations)
    conn.execute("DELETE FROM schema_migrations WHERE filename = '0001_first.sql'")
    with pytest.raises(MigrationError, match="0001_first"):
        apply_migrations(conn, scratch_migrations)


def test_badly_named_file_fails(tmp_path: Path, scratch_migrations: Path) -> None:
    (scratch_migrations / "extra_notes.sql").write_text("SELECT 1;", encoding="utf-8")
    with pytest.raises(MigrationError, match="extra_notes"):
        migration_files(scratch_migrations)


def test_failing_migration_is_atomic(tmp_path: Path, scratch_migrations: Path) -> None:
    (scratch_migrations / "0003_broken.sql").write_text(
        "CREATE TABLE c (id INTEGER PRIMARY KEY); THIS IS NOT SQL;",
        encoding="utf-8",
    )
    conn = connect(tmp_path / "s.db")
    with pytest.raises(sqlite3.OperationalError):
        apply_migrations(conn, scratch_migrations)
    # The good prefix landed and was recorded; nothing of 0003 survives.
    assert {"a", "b"} <= _tables(conn)
    assert "c" not in _tables(conn)
    recorded = {
        r[0] for r in conn.execute("SELECT filename FROM schema_migrations").fetchall()
    }
    assert recorded == {"0001_first.sql", "0002_second.sql"}


def test_shipped_migration_trees_are_wellformed() -> None:
    """The real directory and course trees parse and number cleanly."""
    from app.db.shards import COURSE_MIGRATIONS, DIRECTORY_MIGRATIONS

    for tree in (DIRECTORY_MIGRATIONS, COURSE_MIGRATIONS):
        files = migration_files(tree)
        assert files, f"no migrations in {tree}"
        assert files == sorted(files)
