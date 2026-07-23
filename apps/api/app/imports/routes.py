"""PDF import endpoints (backend guide section 5, milestone 4.1). A professor
uploads a PDF straight to object storage via a presigned URL, then completes the
handshake to enqueue decode; the API never receives the bytes. Imports are an
authoring surface gated through ensure_course_owner, and they nest under the
course (decision 0013): per-shard import ids collide across courses, so a flat
/imports/{id} could not locate the shard.

4.1 stops at decode (page markdown, cached). Figure extraction (4.2),
segmentation (4.3), and the confirmation surface (4.4) build on these rows.
"""

import sqlite3
import time
import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field

from app.auth.deps import get_shards, require_professor
from app.auth.models import Identity
from app.courses.routes import ensure_course_owner
from app.db.shards import ShardManager
from app.problems import Problem
from app.storage import (
    IMPORTS_BUCKET,
    PRESIGN_TTL_SECONDS,
    ObjectStorage,
    get_object_storage,
)
from app.tasks import TaskQueue, get_task_queue

router = APIRouter(prefix="/api/v1/courses", tags=["imports"])

MAX_PDF_BYTES = 60 * 1024 * 1024  # 60 MiB, backend guide section 5 Stage 1
_CREATE_SCOPE = "create_import"


class ImportIn(BaseModel):
    content_type: Literal["application/pdf"] = "application/pdf"
    size_bytes: int = Field(gt=0, le=MAX_PDF_BYTES)


class ImportCreated(BaseModel):
    import_id: int
    status: str
    storage_key: str
    upload_url: str


class ImportOut(BaseModel):
    id: int
    status: str
    page_count: int | None
    created_at: int


async def _load_import(shards: ShardManager, course_id: int, import_id: int) -> ImportOut:
    def read(conn: sqlite3.Connection) -> ImportOut:
        row = conn.execute(
            "SELECT id, status, page_count, created_at FROM import_jobs WHERE id = ?",
            (import_id,),
        ).fetchone()
        # The import lives in this course's shard; an id from another course
        # simply is not here, so a 404 needs no extra ownership check.
        if row is None:
            raise HTTPException(status_code=404, detail="Import not found.")
        return ImportOut(
            id=int(row[0]),
            status=str(row[1]),
            page_count=None if row[2] is None else int(row[2]),
            created_at=int(row[3]),
        )

    return await shards.course_reads(course_id).run(read)


@router.post(
    "/{course_id}/imports",
    status_code=201,
    response_model=ImportCreated,
    responses={401: {"model": Problem}, 403: {"model": Problem}, 404: {"model": Problem}},
)
async def create_import(
    course_id: int,
    body: ImportIn,
    identity: Annotated[Identity, Depends(require_professor)],
    shards: Annotated[ShardManager, Depends(get_shards)],
    storage: Annotated[ObjectStorage, Depends(get_object_storage)],
    idempotency_key: Annotated[str | None, Header()] = None,
) -> ImportCreated:
    """Create an import job and hand back a presigned URL to PUT the PDF. The
    create is idempotent: a retry with the same key returns the original job
    (and a fresh URL for its key), never a duplicate."""
    await ensure_course_owner(shards, course_id, identity)
    now = int(time.time())
    key = f"imports/{course_id}/{uuid.uuid4().hex}/source.pdf"

    def create(conn: sqlite3.Connection) -> int:
        if idempotency_key is not None:
            seen = conn.execute(
                "SELECT import_id FROM import_idempotency_keys WHERE key = ? AND scope = ?",
                (idempotency_key, _CREATE_SCOPE),
            ).fetchone()
            if seen is not None:
                return int(seen[0])
        cursor = conn.execute(
            "INSERT INTO import_jobs (course_id, storage_key, status, created_at)"
            " VALUES (?, ?, 'pending', ?)",
            (course_id, key, now),
        )
        import_id = cursor.lastrowid
        assert import_id is not None
        if idempotency_key is not None:
            conn.execute(
                "INSERT INTO import_idempotency_keys (key, scope, import_id, created_at)"
                " VALUES (?, ?, ?, ?)",
                (idempotency_key, _CREATE_SCOPE, import_id, now),
            )
        return int(import_id)

    import_id = await shards.course(course_id).run(create)

    def read(conn: sqlite3.Connection) -> tuple[str, str]:
        row = conn.execute(
            "SELECT storage_key, status FROM import_jobs WHERE id = ?", (import_id,)
        ).fetchone()
        return str(row[0]), str(row[1])

    storage_key, status = await shards.course_reads(course_id).run(read)
    upload_url = storage.generate_presigned_url(
        "put_object",
        Params={"Bucket": IMPORTS_BUCKET, "Key": storage_key},
        ExpiresIn=PRESIGN_TTL_SECONDS,
    )
    return ImportCreated(
        import_id=import_id, status=status, storage_key=storage_key, upload_url=upload_url
    )


@router.post(
    "/{course_id}/imports/{import_id}/complete",
    response_model=ImportOut,
    responses={401: {"model": Problem}, 403: {"model": Problem}, 404: {"model": Problem}},
)
async def complete_import(
    course_id: int,
    import_id: int,
    identity: Annotated[Identity, Depends(require_professor)],
    shards: Annotated[ShardManager, Depends(get_shards)],
    task_queue: Annotated[TaskQueue, Depends(get_task_queue)],
) -> ImportOut:
    """Signal the PDF is uploaded. Flips pending to uploaded and enqueues decode.
    Naturally idempotent: completing an already-uploaded import enqueues
    nothing, so a retry never doubles the work."""
    await ensure_course_owner(shards, course_id, identity)

    def apply(conn: sqlite3.Connection) -> bool:
        row = conn.execute(
            "SELECT status FROM import_jobs WHERE id = ?", (import_id,)
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Import not found.")
        if str(row[0]) != "pending":
            return False
        conn.execute(
            "UPDATE import_jobs SET status = 'uploaded' WHERE id = ?", (import_id,)
        )
        return True

    flipped = await shards.course(course_id).run(apply)
    if flipped:
        await task_queue.enqueue_process_import(course_id, import_id)
    return await _load_import(shards, course_id, import_id)


@router.get(
    "/{course_id}/imports/{import_id}",
    response_model=ImportOut,
    responses={401: {"model": Problem}, 403: {"model": Problem}, 404: {"model": Problem}},
)
async def get_import(
    course_id: int,
    import_id: int,
    identity: Annotated[Identity, Depends(require_professor)],
    shards: Annotated[ShardManager, Depends(get_shards)],
) -> ImportOut:
    await ensure_course_owner(shards, course_id, identity)
    return await _load_import(shards, course_id, import_id)
