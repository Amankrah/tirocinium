"""Milestone 1.3: snapshots, digests, and the upload seam. The digest is the
drill's verification currency (row counts and content checksums per table),
so its determinism and sensitivity get their own tests."""

import sqlite3
from pathlib import Path

import boto3
import pytest
from botocore.stub import ANY, Stubber

from app.db.backup import digest_shard, snapshot_shard, upload_file
from app.db.connection import connect
from app.db.migrations import apply_migrations
from app.db.shards import COURSE_MIGRATIONS


@pytest.fixture()
def shard(tmp_path: Path) -> Path:
    path = tmp_path / "course.db"
    conn = connect(path)
    apply_migrations(conn, COURSE_MIGRATIONS)
    conn.execute("INSERT INTO concepts (id, name, position) VALUES (7, 'DCF', 1)")
    conn.execute(
        "INSERT INTO evidence_events"
        " (seat_id, concept_id, source, score, confidence, k, ref_kind, ref_id,"
        "  created_at)"
        " VALUES (1, 7, 'answer_match', 1.0, 0.9, 1.0, 'submission', 1, 0)"
    )
    conn.close()
    return path


def test_digest_is_deterministic(shard: Path) -> None:
    assert digest_shard(shard) == digest_shard(shard)


def test_digest_counts_rows(shard: Path) -> None:
    d = digest_shard(shard)
    assert d["concepts"].rows == 1
    assert d["evidence_events"].rows == 1
    assert d["mastery_state"].rows == 0


def test_digest_is_sensitive_to_any_change(shard: Path) -> None:
    before = digest_shard(shard)
    conn = connect(shard)
    conn.execute("UPDATE concepts SET name = 'DCf' WHERE id = 7")
    conn.close()
    after = digest_shard(shard)
    assert before["concepts"].checksum != after["concepts"].checksum
    assert before["concepts"].rows == after["concepts"].rows
    assert before["evidence_events"] == after["evidence_events"]


def test_snapshot_matches_source(shard: Path, tmp_path: Path) -> None:
    dest = tmp_path / "snapshot.db"
    snapshot_shard(shard, dest)
    assert digest_shard(dest) == digest_shard(shard)


def test_snapshot_is_independent_of_source(shard: Path, tmp_path: Path) -> None:
    dest = tmp_path / "snapshot.db"
    snapshot_shard(shard, dest)
    conn = connect(shard)
    conn.execute("DELETE FROM evidence_events")
    conn.execute("DELETE FROM concepts")
    conn.close()
    assert digest_shard(dest)["concepts"].rows == 1


def test_snapshot_refuses_to_overwrite(shard: Path, tmp_path: Path) -> None:
    dest = tmp_path / "snapshot.db"
    snapshot_shard(shard, dest)
    with pytest.raises(sqlite3.OperationalError):
        snapshot_shard(shard, dest)


def test_upload_targets_the_exact_key(shard: Path) -> None:
    client = boto3.client(
        "s3",
        region_name="us-east-1",
        aws_access_key_id="stub",
        aws_secret_access_key="stub",
    )
    with Stubber(client) as stub:
        stub.add_response(
            "put_object",
            {"ETag": '"abc"'},
            expected_params={
                "Bucket": "tirocinium-snapshots",
                "Key": "2026-07-23/courses/1.db",
                "Body": ANY,
            },
        )
        upload_file(client, shard, "tirocinium-snapshots", "2026-07-23/courses/1.db")
        stub.assert_no_pending_responses()
