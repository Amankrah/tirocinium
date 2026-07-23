"""Backups (backend guide 3.5, milestone 1.3): VACUUM INTO snapshots, the
shard digest the restore drill verifies against, and the object-storage
upload seam. Litestream handles continuous WAL replication (configured by
scripts/litestream_config.py and drilled by infra/restore-drill.sh); this
module owns the snapshot half and the verification currency.
"""

import hashlib
import os
from pathlib import Path
from typing import BinaryIO, Protocol

from pydantic import BaseModel

from app.db.connection import connect


class ObjectStorageClient(Protocol):
    """The slice of the S3 API this module uses; boto3 clients satisfy it
    and tests stub it."""

    def put_object(self, *, Bucket: str, Key: str, Body: BinaryIO) -> object: ...


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
