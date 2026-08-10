"""Backups (backend guide 3.5, milestones 1.3 and 9.4): VACUUM INTO snapshots,
the shard digest the restore drill verifies against, the object-storage upload
seam, and the verification that says whether the backups a course depends on
actually exist and are current. Litestream handles continuous WAL replication
(configured by scripts/litestream_config.py and drilled by
infra/restore-drill.sh); this module owns the snapshot half.

A backup nobody checks is a backup nobody has. The restore drill proves the
mechanism works; `verify_snapshots` proves last night's artefacts are really
there, which is the failure the drill cannot see because the drill makes its
own fixture.
"""

import datetime
import hashlib
import os
from pathlib import Path
from typing import Any, BinaryIO, Protocol

from pydantic import BaseModel

from app.db.connection import connect


class ObjectStorageClient(Protocol):
    """The slice of the S3 API this module uses; boto3 clients satisfy it
    and tests stub it."""

    def put_object(self, *, Bucket: str, Key: str, Body: BinaryIO) -> object: ...

    def list_objects_v2(self, **kwargs: Any) -> Any: ...


class TableDigest(BaseModel, frozen=True):
    """Row count and content checksum of one table; the unit of restore
    verification."""

    rows: int
    checksum: str


def digest_shard(path: Path) -> dict[str, TableDigest]:
    """Deterministic per-table digest of a shard: row count plus a sha256
    over every row's values in rowid order. Any changed, added, or removed
    row changes the table's checksum."""
    conn = connect(path, readonly=True)
    try:
        rows_meta = conn.execute(
            "SELECT name, sql FROM sqlite_master"
            " WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
            " ORDER BY name"
        ).fetchall()
        # Virtual tables (FTS5) and their shadow tables are derived,
        # rebuildable data with exotic storage (some are WITHOUT ROWID);
        # the digest covers the real content tables they derive from.
        virtual = {
            name
            for name, sql in rows_meta
            if sql and "CREATE VIRTUAL TABLE" in sql.upper()
        }
        tables = [
            name
            for name, _ in rows_meta
            if name not in virtual
            and not any(name.startswith(f"{v}_") for v in virtual)
        ]
        out: dict[str, TableDigest] = {}
        for table in tables:
            h = hashlib.sha256()
            rows = 0
            for row in conn.execute(f'SELECT * FROM "{table}" ORDER BY rowid'):
                rows += 1
                for value in row:
                    h.update(repr(value).encode("utf-8", "surrogatepass"))
                    h.update(b"\x1f")
                h.update(b"\x1e")
            out[table] = TableDigest(rows=rows, checksum=h.hexdigest())
        return out
    finally:
        conn.close()


def snapshot_shard(src: Path, dest: Path) -> Path:
    """VACUUM INTO a fresh snapshot file. Runs on its own helper connection
    (VACUUM cannot run inside the writer queue's transaction) and is safe
    against a concurrently writing shard thanks to WAL. Refuses to
    overwrite: a snapshot path is written exactly once."""
    conn = connect(src, readonly=True)
    try:
        conn.execute("VACUUM INTO ?", (str(dest),))
    finally:
        conn.close()
    return dest


def upload_file(
    client: ObjectStorageClient, path: Path, bucket: str, key: str
) -> None:
    """Put one file into object storage. The client is passed in so tests
    stub it and scripts build it from environment configuration."""
    with path.open("rb") as f:
        client.put_object(Bucket=bucket, Key=key, Body=f)


def s3_client_from_env() -> ObjectStorageClient:
    """The dev/CI object-storage client: MinIO-compatible, path-style,
    configured by TIRO_S3_* with the compose defaults."""
    import boto3
    from botocore.config import Config

    client: ObjectStorageClient = boto3.client(
        "s3",
        endpoint_url=os.environ.get("TIRO_S3_ENDPOINT", "http://localhost:9000"),
        aws_access_key_id=os.environ.get("TIRO_S3_ACCESS_KEY", "tirocinium"),
        aws_secret_access_key=os.environ.get("TIRO_S3_SECRET_KEY", "tirocinium-dev"),
        region_name=os.environ.get("TIRO_S3_REGION", "us-east-1"),
        config=Config(s3={"addressing_style": "path"}),
    )
    return client


# A nightly job that misses one run is worth an alert; the default window gives
# a night's schedule drift and no more, so a silent two-day gap cannot hide.
DEFAULT_MAX_AGE_SECONDS = 36 * 3600


class SnapshotReport(BaseModel, frozen=True):
    """What the latest snapshot of one shard looks like, or why there is none."""

    shard: str
    key: str | None = None
    age_seconds: float | None = None
    size_bytes: int | None = None
    ok: bool
    reason: str | None = None


class BackupVerification(BaseModel, frozen=True):
    """The whole check. `ok` is false if any shard's backup is missing, stale,
    or empty, which is what the scheduled job alerts on."""

    ok: bool
    checked_at: int
    max_age_seconds: float
    snapshots: list[SnapshotReport]

    @property
    def failures(self) -> list[SnapshotReport]:
        return [report for report in self.snapshots if not report.ok]


def _latest_by_shard(
    client: ObjectStorageClient, bucket: str, prefix: str
) -> dict[str, tuple[str, datetime.datetime, int]]:
    """The most recent object per shard under the snapshot prefix.

    Keys are `{prefix}{date}/{shard path}`, so the shard is everything after
    the date segment; grouping on that rather than on the date is what makes
    the check independent of how the job names its runs."""
    latest: dict[str, tuple[str, datetime.datetime, int]] = {}
    token: str | None = None
    while True:
        kwargs: dict[str, Any] = {"Bucket": bucket, "Prefix": prefix}
        if token:
            kwargs["ContinuationToken"] = token
        page = client.list_objects_v2(**kwargs)
        for item in page.get("Contents", []) or []:
            key = str(item["Key"])
            tail = key[len(prefix) :]
            if "/" not in tail:
                continue
            shard = tail.split("/", 1)[1]
            modified = item["LastModified"]
            size = int(item.get("Size", 0))
            current = latest.get(shard)
            if current is None or modified > current[1]:
                latest[shard] = (key, modified, size)
        if not page.get("IsTruncated"):
            return latest
        token = page.get("NextContinuationToken")
        if not token:
            return latest


def verify_snapshots(
    client: ObjectStorageClient,
    bucket: str,
    shards: list[str],
    *,
    now: datetime.datetime,
    prefix: str = "snapshots/",
    max_age_seconds: float = DEFAULT_MAX_AGE_SECONDS,
) -> BackupVerification:
    """Check that every shard has a recent, non-empty snapshot in storage.

    `shards` are the shard paths relative to the data directory, the same form
    the snapshot job writes, so a course that exists but was never snapshotted
    reports as missing rather than being silently absent from the result.
    """
    latest = _latest_by_shard(client, bucket, prefix)
    reports: list[SnapshotReport] = []
    for shard in sorted(shards):
        found = latest.get(shard)
        if found is None:
            reports.append(
                SnapshotReport(shard=shard, ok=False, reason="no snapshot found")
            )
            continue
        key, modified, size = found
        age = (now - modified).total_seconds()
        if size <= 0:
            reason = "snapshot is empty"
        elif age > max_age_seconds:
            reason = f"snapshot is {age / 3600:.1f} h old"
        else:
            reason = None
        reports.append(
            SnapshotReport(
                shard=shard,
                key=key,
                age_seconds=age,
                size_bytes=size,
                ok=reason is None,
                reason=reason,
            )
        )
    return BackupVerification(
        ok=all(report.ok for report in reports),
        checked_at=int(now.timestamp()),
        max_age_seconds=max_age_seconds,
        snapshots=reports,
    )
