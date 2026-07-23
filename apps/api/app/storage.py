"""Object storage seam: the slice of the S3 API the app uses, as a Protocol
so tests substitute an in-memory fake and scripts build real clients from
environment configuration. MinIO in dev and CI (compose), S3-compatible in
production."""

import os
from typing import Any, Protocol


class ObjectStorage(Protocol):
    def create_bucket(self, *, Bucket: str) -> object: ...

    def put_object(self, *, Bucket: str, Key: str, Body: Any) -> object: ...

    def generate_presigned_url(
        self, ClientMethod: str, Params: dict[str, str], ExpiresIn: int
    ) -> str: ...


ARTIFACTS_BUCKET = os.environ.get("TIRO_ARTIFACT_BUCKET", "tirocinium-artifacts")

# Original scans and preprocessed page images (backend guide 3.3: never in
# SQLite). Students PUT directly here via presigned URLs; the shard holds only
# the storage keys and metadata.
SCANS_BUCKET = os.environ.get("TIRO_SCANS_BUCKET", "tirocinium-scans")

# Presigned URLs for one-time downloads live this long (15 minutes): long
# enough to click, short enough that a leaked URL goes stale fast. The same
# budget covers direct-to-storage upload URLs.
PRESIGN_TTL_SECONDS = 900


def get_object_storage() -> ObjectStorage:
    """FastAPI dependency; tests override it with a fake."""
    from app.db.backup import s3_client_from_env

    client: ObjectStorage = s3_client_from_env()  # type: ignore[assignment]
    return client
