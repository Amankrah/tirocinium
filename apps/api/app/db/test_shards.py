"""Milestone 1.1: the shard manager. One file per course under
data/courses/, directory.db beside them, migrations applied per shard at
startup, isolation between shards, and the existing mastery store running
green on a managed shard through the writer queue."""

import sqlite3
from pathlib import Path

from app.db.shards import ShardManager
from mastery_store import SCHEMA as STORE_SCHEMA
from mastery_store import MasteryStore


def _tables(conn: sqlite3.Connection) -> set[str]:
    rows = conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
    return {r[0] for r in rows}


async def test_paths_follow_the_guide(tmp_path: Path) -> None:
    async with ShardManager(tmp_path) as mgr:
        await mgr.course(7).run(lambda c: None)
        assert (tmp_path / "directory.db").is_file()
        assert (tmp_path / "courses" / "7.db").is_file()


async def test_directory_and_course_shards_are_migrated(tmp_path: Path) -> None:
    async with ShardManager(tmp_path) as mgr:
        directory_tables = await mgr.directory.run(_tables)
        assert "courses" in directory_tables
        course_tables = await mgr.course(1).run(_tables)
        assert {"concepts", "evidence_events", "mastery_state"} <= course_tables


async def test_shards_are_isolated(tmp_path: Path) -> None:
    async with ShardManager(tmp_path) as mgr:
        await mgr.course(1).run(
            lambda c: c.execute(
                "INSERT INTO concepts (id, name, position) VALUES (1, 'DCF', 1)"
            )
        )
        count = await mgr.course(2).run(
            lambda c: c.execute("SELECT COUNT(*) FROM concepts").fetchone()[0]
        )
        assert count == 0


async def test_startup_migrates_existing_shards(tmp_path: Path) -> None:
    """A shard created by an older tree picks up new migrations when the
    manager starts, not when the shard happens to be touched."""
    async with ShardManager(tmp_path) as mgr:
        await mgr.course(3).run(lambda c: None)
    # Simulate an older shard: undo the newest migration and its record (an
    # older tree simply had not shipped it yet; removing an earlier one
    # instead would be divergence, which rightly fails loudly).
    raw = sqlite3.connect(tmp_path / "courses" / "3.db")
    raw.executescript(
        "DROP TABLE zstd_dictionaries;"
        "DELETE FROM schema_migrations WHERE filename LIKE '0002%';"
    )
    raw.close()
    async with ShardManager(tmp_path) as mgr:
        tables = await mgr.course(3).run(_tables)
        assert "zstd_dictionaries" in tables


async def test_reads_go_through_the_pool(tmp_path: Path) -> None:
    async with ShardManager(tmp_path) as mgr:
        await mgr.course(1).run(
            lambda c: c.execute(
                "INSERT INTO concepts (id, name, position) VALUES (1, 'DCF', 1)"
            )
        )
        name = await mgr.course_reads(1).run(
            lambda c: c.execute("SELECT name FROM concepts").fetchone()[0]
        )
        assert name == "DCF"


async def test_course_migration_covers_store_schema(tmp_path: Path) -> None:
    """The 0001 course migration and mastery_store.SCHEMA must not drift:
    everything the store would create already exists, identically named,
    on a managed shard."""
    probe = sqlite3.connect(":memory:")
    probe.executescript(STORE_SCHEMA)
    store_tables = _tables(probe)
    probe.close()

    async with ShardManager(tmp_path) as mgr:
        shard_tables = await mgr.course(1).run(_tables)
    assert store_tables <= shard_tables


def test_app_startup_opens_and_migrates_the_data_layer(tmp_path: Path) -> None:
    """The FastAPI lifespan owns the ShardManager (milestone 1.1: migrations
    applied per shard at startup)."""
    from fastapi.testclient import TestClient

    from app.main import create_app

    with TestClient(create_app(data_dir=tmp_path)) as client:
        assert client.get("/api/v1/health").status_code == 200
        assert (tmp_path / "directory.db").is_file()


async def test_mastery_store_runs_on_a_managed_shard(tmp_path: Path) -> None:
    def seed(conn: sqlite3.Connection) -> None:
        # Plain execute only: executescript manages transactions itself and
        # is forbidden inside writer.run (see ShardWriter).
        conn.execute("INSERT INTO concepts (id, name, position) VALUES (7, 'DCF', 1)")
        conn.execute(
            "INSERT INTO case_study_concepts (case_study_id, concept_id, weight)"
            " VALUES (1, 7, 1.0)"
        )

    async with ShardManager(tmp_path) as mgr:
        await mgr.course(1).run(seed)

        def submit(conn: sqlite3.Connection) -> str:
            store = MasteryStore(conn)
            views = store.record_submission_evidence(
                seat_id=1,
                case_study_id=1,
                submission_id=100,
                source="answer_match",
                score=1.0,
                confidence=0.95,
                at=0,
            )
            return views[0].label

        label = await mgr.course(1).run(submit)
        assert label in {"shaky", "developing", "solid"}
