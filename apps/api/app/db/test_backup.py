"""Milestone 1.3: snapshots, digests, and the upload seam. The digest is the
drill's verification currency (row counts and content checksums per table),
so its determinism and sensitivity get their own tests."""

import sqlite3
from pathlib import Path
from typing import Any, cast

import boto3
import pytest
from botocore.stub import ANY, Stubber

from app.db.backup import (
    _configured,
    digest_shard,
    s3_client_from_env,
    snapshot_shard,
    upload_file,
)
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


def test_unset_s3_settings_keep_the_compose_defaults(monkeypatch: pytest.MonkeyPatch) -> None:
    """Development runs with no TIRO_S3_* at all and must still reach the
    compose MinIO, so an unset variable is not the same as an empty one."""
    for name in ("TIRO_S3_ENDPOINT", "TIRO_S3_ACCESS_KEY", "TIRO_S3_SECRET_KEY"):
        monkeypatch.delenv(name, raising=False)

    assert _configured("TIRO_S3_ENDPOINT", "http://localhost:9000") == (
        "http://localhost:9000"
    )
    assert _configured("TIRO_S3_ACCESS_KEY", "tirocinium") == "tirocinium"


def test_empty_s3_credentials_mean_the_ambient_ones(monkeypatch: pytest.MonkeyPatch) -> None:
    """A deployment on an instance role leaves the credentials empty. That has
    to reach boto3 as None: an empty access key does not fall back to the role,
    it fails to sign, and the error names neither the role nor the empty key."""
    monkeypatch.setenv("TIRO_S3_ACCESS_KEY", "")
    monkeypatch.setenv("TIRO_S3_SECRET_KEY", "")

    assert _configured("TIRO_S3_ACCESS_KEY", "tirocinium") is None
    assert _configured("TIRO_S3_SECRET_KEY", "tirocinium-dev") is None


def test_real_s3_endpoint_drops_path_style_addressing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """MinIO needs path-style addressing; AWS has been deprecating it. An
    empty endpoint means real AWS, so it must reach boto3 as None and leave
    the addressing style alone; only a custom endpoint selects path-style.

    The ambient AWS variables stand in for the instance role. They are set
    here rather than left to the environment because an empty TIRO_S3 key is
    precisely the instruction to go and resolve credentials elsewhere, and a
    test that does that reads whatever the machine running it happens to have
    configured."""
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "ambient")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "ambient-secret")
    monkeypatch.setenv("TIRO_S3_ENDPOINT", "")
    monkeypatch.setenv("TIRO_S3_REGION", "ca-central-1")
    monkeypatch.setenv("TIRO_S3_ACCESS_KEY", "")
    monkeypatch.setenv("TIRO_S3_SECRET_KEY", "")

    # The Protocol models only the calls the app makes; boto3's own `meta`
    # is what records the resolved endpoint and addressing style.
    client = cast(Any, s3_client_from_env())
    assert client.meta.region_name == "ca-central-1"
    assert client.meta.config.s3 in (None, {})
    assert "amazonaws.com" in client.meta.endpoint_url
    # The empty TIRO_S3 keys sent boto3 to the ambient credentials rather than
    # signing with an empty string, which is the whole point of the change.
    assert client._request_signer._credentials.access_key == "ambient"


def test_custom_endpoint_keeps_path_style_for_minio(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The compose MinIO is reached by a custom endpoint and cannot serve
    virtual-hosted requests, so that is the case that keeps path-style."""
    monkeypatch.setenv("TIRO_S3_ENDPOINT", "http://localhost:9000")
    client = cast(Any, s3_client_from_env())
    assert client.meta.config.s3 == {"addressing_style": "path"}
