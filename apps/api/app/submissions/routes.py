"""The handwritten solution upload path (milestone 3.1, backend guide section
4 Stage 1). A seat requests presigned upload URLs for a variant, PUTs its page
images or PDF straight to object storage, then completes the manifest; the API
never touches the bytes. Limits are enforced server-side (max 25 pages, max
15 MB per page, JPEG/PNG/HEIC/PDF), the create call is idempotent, and a seat
can read only its own submissions.

Submissions are a seat surface: the seat identity carries its one course, so
these endpoints need no course in the path and there is no colliding-id
ambiguity (decision 0013). Professor review of submissions arrives in 8.1.
"""

import json
import sqlite3
import time
import uuid
from collections.abc import AsyncIterator
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Header, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.auth.deps import get_shards, require_seat
from app.auth.models import Identity
from app.db.shards import ShardManager
from app.events import Event, EventBus, channel_for, get_event_bus
from app.problems import Problem
from app.storage import (
    PRESIGN_TTL_SECONDS,
    SCANS_BUCKET,
    ObjectStorage,
    get_object_storage,
)
from app.tasks import TaskQueue, get_task_queue
from app.transcription.pipeline import TERMINAL_STATUSES

router = APIRouter(prefix="/api/v1", tags=["submissions"])

MAX_PAGES = 25
MAX_PAGE_BYTES = 15 * 1024 * 1024  # 15 MiB, backend guide section 4 Stage 1
_CREATE_SCOPE = "create_submission"

PageContentType = Literal["image/jpeg", "image/png", "image/heic", "application/pdf"]


class PageIn(BaseModel):
    content_type: PageContentType
    size_bytes: int = Field(gt=0, le=MAX_PAGE_BYTES)
    content_hash: str | None = Field(default=None, max_length=128)


class SubmissionIn(BaseModel):
    pages: list[PageIn] = Field(min_length=1, max_length=MAX_PAGES)


class UploadTarget(BaseModel):
    page_index: int
    storage_key: str
    url: str


class SubmissionCreated(BaseModel):
    submission_id: int
    status: str
    storage_prefix: str
    uploads: list[UploadTarget]


class PageOut(BaseModel):
    page_index: int
    storage_key: str
    content_type: str
    size_bytes: int
    content_hash: str | None


class SubmissionOut(BaseModel):
    id: int
    variant_id: int
    status: str
    page_count: int
    submitted_at: int
    recognition_conf: float | None
    pages: list[PageOut]


def _seat_context(identity: Identity) -> tuple[int, int]:
    assert identity.course_id is not None and identity.seat_id is not None
    return identity.course_id, identity.seat_id


async def _load_submission(
    shards: ShardManager, course_id: int, submission_id: int, seat_id: int
) -> SubmissionOut:
    def read(conn: sqlite3.Connection) -> SubmissionOut:
        row = conn.execute(
            "SELECT id, variant_id, seat_id, page_count, status, submitted_at,"
            " recognition_conf FROM submissions WHERE id = ?",
            (submission_id,),
        ).fetchone()
        # A submission that is not this seat's is indistinguishable from one
        # that does not exist (backend 7.1: a seat reads only its own rows).
        if row is None or int(row[2]) != seat_id:
            raise HTTPException(status_code=404, detail="Submission not found.")
        pages = conn.execute(
            "SELECT page_index, storage_key, content_type, size_bytes, content_hash"
            " FROM submission_pages WHERE submission_id = ? ORDER BY page_index",
            (submission_id,),
        ).fetchall()
        return SubmissionOut(
            id=int(row[0]),
            variant_id=int(row[1]),
            status=str(row[4]),
            page_count=int(row[3]),
            submitted_at=int(row[5]),
            recognition_conf=None if row[6] is None else float(row[6]),
            pages=[
                PageOut(
                    page_index=int(p[0]),
                    storage_key=str(p[1]),
                    content_type=str(p[2]),
                    size_bytes=int(p[3]),
                    content_hash=None if p[4] is None else str(p[4]),
                )
                for p in pages
            ],
        )

    return await shards.course_reads(course_id).run(read)


@router.post(
    "/variants/{variant_id}/submissions",
    status_code=201,
    response_model=SubmissionCreated,
    responses={403: {"model": Problem}, 404: {"model": Problem}},
)
async def create_submission(
    variant_id: int,
    body: SubmissionIn,
    identity: Annotated[Identity, Depends(require_seat)],
    shards: Annotated[ShardManager, Depends(get_shards)],
    storage: Annotated[ObjectStorage, Depends(get_object_storage)],
    idempotency_key: Annotated[str | None, Header()] = None,
) -> SubmissionCreated:
    course_id, seat_id = _seat_context(identity)
    now = int(time.time())
    prefix = f"scans/{course_id}/{uuid.uuid4().hex}"

    def create(conn: sqlite3.Connection) -> int:
        if idempotency_key is not None:
            seen = conn.execute(
                "SELECT submission_id FROM idempotency_keys"
                " WHERE key = ? AND scope = ?",
                (idempotency_key, _CREATE_SCOPE),
            ).fetchone()
            if seen is not None:
                return int(seen[0])
        if (
            conn.execute(
                "SELECT 1 FROM variants WHERE id = ?", (variant_id,)
            ).fetchone()
            is None
        ):
            raise HTTPException(status_code=404, detail="Variant not found.")
        cursor = conn.execute(
            "INSERT INTO submissions"
            " (variant_id, seat_id, page_count, storage_prefix, status, submitted_at)"
            " VALUES (?, ?, ?, ?, 'pending', ?)",
            (variant_id, seat_id, len(body.pages), prefix, now),
        )
        submission_id = cursor.lastrowid
        assert submission_id is not None
        conn.executemany(
            "INSERT INTO submission_pages"
            " (submission_id, page_index, storage_key, content_type, size_bytes,"
            "  content_hash)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            [
                (
                    submission_id,
                    index,
                    f"{prefix}/{index}",
                    page.content_type,
                    page.size_bytes,
                    page.content_hash,
                )
                for index, page in enumerate(body.pages)
            ],
        )
        if idempotency_key is not None:
            conn.execute(
                "INSERT INTO idempotency_keys (key, scope, submission_id, created_at)"
                " VALUES (?, ?, ?, ?)",
                (idempotency_key, _CREATE_SCOPE, submission_id, now),
            )
        return int(submission_id)

    submission_id = await shards.course(course_id).run(create)

    def read(conn: sqlite3.Connection) -> tuple[str, str, list[tuple[int, str]]]:
        row = conn.execute(
            "SELECT storage_prefix, status FROM submissions WHERE id = ?",
            (submission_id,),
        ).fetchone()
        pages = conn.execute(
            "SELECT page_index, storage_key FROM submission_pages"
            " WHERE submission_id = ? ORDER BY page_index",
            (submission_id,),
        ).fetchall()
        return str(row[0]), str(row[1]), [(int(p[0]), str(p[1])) for p in pages]

    storage_prefix, status, pages = await shards.course_reads(course_id).run(read)
    uploads = [
        UploadTarget(
            page_index=index,
            storage_key=key,
            url=storage.generate_presigned_url(
                "put_object",
                Params={"Bucket": SCANS_BUCKET, "Key": key},
                ExpiresIn=PRESIGN_TTL_SECONDS,
            ),
        )
        for index, key in pages
    ]
    return SubmissionCreated(
        submission_id=submission_id,
        status=status,
        storage_prefix=storage_prefix,
        uploads=uploads,
    )


@router.post(
    "/submissions/{submission_id}/complete",
    response_model=SubmissionOut,
    responses={403: {"model": Problem}, 404: {"model": Problem}},
)
async def complete_submission(
    submission_id: int,
    identity: Annotated[Identity, Depends(require_seat)],
    shards: Annotated[ShardManager, Depends(get_shards)],
    task_queue: Annotated[TaskQueue, Depends(get_task_queue)],
) -> SubmissionOut:
    """Signal that every page has been uploaded. Flips pending to uploaded and
    enqueues the transcription pipeline (milestone 3.3). Naturally idempotent:
    completing an already-uploaded submission is a no-op and enqueues nothing,
    so a retry never doubles the work."""
    course_id, seat_id = _seat_context(identity)
    now = int(time.time())

    def apply(conn: sqlite3.Connection) -> bool:
        row = conn.execute(
            "SELECT seat_id, status FROM submissions WHERE id = ?",
            (submission_id,),
        ).fetchone()
        if row is None or int(row[0]) != seat_id:
            raise HTTPException(status_code=404, detail="Submission not found.")
        if str(row[1]) != "pending":
            return False
        conn.execute(
            "UPDATE submissions SET status = 'uploaded', submitted_at = ?"
            " WHERE id = ?",
            (now, submission_id),
        )
        return True

    flipped = await shards.course(course_id).run(apply)
    if flipped:
        await task_queue.enqueue_process_submission(course_id, submission_id)
    return await _load_submission(shards, course_id, submission_id, seat_id)


@router.get(
    "/submissions/{submission_id}",
    response_model=SubmissionOut,
    responses={403: {"model": Problem}, 404: {"model": Problem}},
)
async def get_submission(
    submission_id: int,
    identity: Annotated[Identity, Depends(require_seat)],
    shards: Annotated[ShardManager, Depends(get_shards)],
) -> SubmissionOut:
    course_id, seat_id = _seat_context(identity)
    return await _load_submission(shards, course_id, submission_id, seat_id)


def _sse(event: Event) -> str:
    return f"data: {json.dumps(event)}\n\n"


async def _authorized_status(
    shards: ShardManager, course_id: int, submission_id: int, seat_id: int
) -> str:
    def read(conn: sqlite3.Connection) -> str:
        row = conn.execute(
            "SELECT seat_id, status FROM submissions WHERE id = ?", (submission_id,)
        ).fetchone()
        if row is None or int(row[0]) != seat_id:
            raise HTTPException(status_code=404, detail="Submission not found.")
        return str(row[1])

    return await shards.course_reads(course_id).run(read)


@router.get(
    "/submissions/{submission_id}/events",
    responses={403: {"model": Problem}, 404: {"model": Problem}},
)
async def submission_events(
    submission_id: int,
    identity: Annotated[Identity, Depends(require_seat)],
    shards: Annotated[ShardManager, Depends(get_shards)],
    bus: Annotated[EventBus, Depends(get_event_bus)],
) -> StreamingResponse:
    """Server-sent progress for one submission (milestone 3.3). Emits the
    current status first, then forwards the worker's per-page events off the
    submission's channel until a terminal 'done'. A seat sees only its own
    submission (404 otherwise), the same rule as every submission surface."""
    course_id, seat_id = _seat_context(identity)
    status = await _authorized_status(shards, course_id, submission_id, seat_id)

    async def stream() -> AsyncIterator[str]:
        yield _sse({"type": "status", "status": status})
        if status in TERMINAL_STATUSES:
            yield _sse({"type": "done", "status": status})
            return
        async with bus.listen(channel_for(course_id, submission_id)) as events:
            async for event in events:
                yield _sse(event)
                if event.get("type") == "done":
                    return

    return StreamingResponse(stream(), media_type="text/event-stream")
