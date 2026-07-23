"""Object storage seam: the slice of the S3 API the app uses, as a Protocol
so tests substitute an in-memory fake and scripts build real clients from
environment configuration. MinIO in dev and CI (compose), S3-compatible in
production."""

import os
from typing import Any, Protocol


class ObjectStorage(Protocol):
    def create_bucket(self, *, Bucket: str) -> object: ...

    def put_object(self, *, Bucket: str, Key: str, Body: Any) -> object: ...

    def get_object(self, *, Bucket: str, Key: str) -> Any: ...

    def generate_presigned_url(
        self, ClientMethod: str, Params: dict[str, str], ExpiresIn: int
    ) -> str: ...


ARTIFACTS_BUCKET = os.environ.get("TIRO_ARTIFACT_BUCKET", "tirocinium-artifacts")

# Original scans and preprocessed page images (backend guide 3.3: never in
# SQLite). Students PUT directly here via presigned URLs; the shard holds only
# the storage keys and metadata.
SCANS_BUCKET = os.environ.get("TIRO_SCANS_BUCKET", "tirocinium-scans")

# Source PDFs, rendered page images, and (from 4.2) extracted figure crops for
# PDF import (backend guide section 5). Professors PUT the PDF directly here via
# a presigned URL; the shard holds only keys and metadata.
IMPORTS_BUCKET = os.environ.get("TIRO_IMPORTS_BUCKET", "tirocinium-imports")

# Presigned URLs for one-time downloads live this long (15 minutes): long
# enough to click, short enough that a leaked URL goes stale fast. The same
# budget covers direct-to-storage upload URLs.
PRESIGN_TTL_SECONDS = 900


def get_object_storage() -> ObjectStorage:
    """FastAPI dependency; tests override it with a fake."""
    from app.db.backup import s3_client_from_env

    client: ObjectStorage = s3_client_from_env()  # type: ignore[assignment]
    return client


def fetch_bytes(storage: ObjectStorage, bucket: str, key: str) -> bytes:
    """Read one object fully into memory. The worker uses this to pull a
    scan back for preprocessing; the API never does (it only ever hands out
    presigned URLs). boto3 returns a streaming body under the 'Body' key."""
    response = storage.get_object(Bucket=bucket, Key=key)
    data = response["Body"].read()
    return data if isinstance(data, bytes) else bytes(data)
