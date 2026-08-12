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
from app.compression import decompress_text
from app.db.shards import ShardManager
from app.events import Event, EventBus, channel_for, get_event_bus
from app.limits import MAX_PAGE_BYTES, MAX_PAGES
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

_CREATE_SCOPE = "create_submission"

PageContentType = Literal["image/jpeg", "image/png", "image/heic", "application/pdf"]


class PageIn(BaseModel):
    content_type: PageContentType
    size_bytes: int = Field(gt=0, le=MAX_PAGE_BYTES)
    content_hash: str | None = Field(default=None, max_length=128)


class SubmissionIn(BaseModel):
    pages: list[PageIn] = Field(min_length=1, max_length=MAX_PAGES)
    # The attempt this work came from, if the student opened one. Optional
    # because a submission without an attempt is legitimate (an older client, a
    # student who started before the feature, a retake); it simply carries no
    # span rather than a made-up one.
    attempt_id: int | None = None


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


class AttemptOut(BaseModel):
    """A started attempt. The timestamp is the server's, deliberately: a span
    the client can name is a span the client can invent, and the professor is
    shown this one (frontend guide 4.2)."""

    attempt_id: int
    variant_id: int
    started_at: int


class SubmissionOut(BaseModel):
    id: int
    variant_id: int
    status: str
    page_count: int
    submitted_at: int
    started_at: int | None
    recognition_conf: float | None
    pages: list[PageOut]


class RegionOut(BaseModel):
    """One transcribed region with its normalised bounding box (top-left
    origin, 0..1) so the client can align text to the page and highlight
    low-confidence spans (backend guide section 4 Stage 5)."""

    bbox: tuple[float, float, float, float]
    confidence: float
    text: str


class PageReadingOut(BaseModel):
    page_index: int
    quality_status: str | None
    reject_reason: str | None
    confidence: float | None
    markdown: str
    regions: list[RegionOut]


class TranscriptionOut(BaseModel):
    """The recognized reading of a submission: the aggregate markdown and mean
    confidence, plus the per-page reading aligned to each page. A seat sees its
    own work; the recognized text is the student's own handwriting, never a
    solution, so returning it reveals no answer."""

    submission_id: int
    status: str
    recognized_markdown: str | None
    recognition_conf: float | None
    pages: list[PageReadingOut]


def _seat_context(identity: Identity) -> tuple[int, int]:
    assert identity.course_id is not None and identity.seat_id is not None
    return identity.course_id, identity.seat_id


async def _load_submission(
    shards: ShardManager, course_id: int, submission_id: int, seat_id: int
) -> SubmissionOut:
    def read(conn: sqlite3.Connection) -> SubmissionOut:
        row = conn.execute(
            "SELECT id, variant_id, seat_id, page_count, status, submitted_at,"
            " recognition_conf, started_at FROM submissions WHERE id = ?",
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
            started_at=None if row[7] is None else int(row[7]),
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


async def _load_transcription(
    shards: ShardManager, course_id: int, submission_id: int, seat_id: int
) -> "TranscriptionOut":
    def read(conn: sqlite3.Connection) -> TranscriptionOut:
        row = conn.execute(
            "SELECT seat_id, status, recognized_z, recognition_conf"
            " FROM submissions WHERE id = ?",
            (submission_id,),
        ).fetchone()
        if row is None or int(row[0]) != seat_id:
            raise HTTPException(status_code=404, detail="Submission not found.")
        recognized = (
            None if row[2] is None else decompress_text(conn, "handwriting", bytes(row[2]))
        )
        # Join each page to its cached reading by the server-computed content
        # hash (migration 0008); a page not yet processed has no match, so its
        # markdown is empty and its regions absent.
        pages = conn.execute(
            "SELECT sp.page_index, sp.quality_status, sp.reject_reason,"
            " pt.markdown_z, pt.confidence, pt.regions_json"
            " FROM submission_pages sp"
            " LEFT JOIN page_transcriptions pt ON sp.content_sha = pt.content_hash"
            " WHERE sp.submission_id = ? ORDER BY sp.page_index",
            (submission_id,),
        ).fetchall()
        readings = [
            PageReadingOut(
                page_index=int(p[0]),
                quality_status=None if p[1] is None else str(p[1]),
                reject_reason=None if p[2] is None else str(p[2]),
                confidence=None if p[4] is None else float(p[4]),
                markdown="" if p[3] is None else decompress_text(conn, "handwriting", bytes(p[3])),
                regions=[]
                if p[5] is None
                else [RegionOut.model_validate(r) for r in json.loads(p[5])],
            )
            for p in pages
        ]
        return TranscriptionOut(
            submission_id=submission_id,
            status=str(row[1]),
            recognized_markdown=recognized,
            recognition_conf=None if row[3] is None else float(row[3]),
            pages=readings,
        )

    return await shards.course_reads(course_id).run(read)


@router.post(
    "/variants/{variant_id}/attempts",
    status_code=201,
    response_model=AttemptOut,
    responses={403: {"model": Problem}, 404: {"model": Problem}},
)
async def start_attempt(
    variant_id: int,
    identity: Annotated[Identity, Depends(require_seat)],
    shards: Annotated[ShardManager, Depends(get_shards)],
) -> AttemptOut:
    """The "start attempt" moment (frontend guide 4.2): the student is opening
    the problem to work it on paper, and the server stamps when. The submission
    that follows may cite this attempt, and the pair becomes the honest record
    of engaged time.

    Starting twice is not an error. A student may open a problem, put it down,
    and come back; each start is its own row and only the one the submission
    cites becomes a span."""
    course_id, seat_id = _seat_context(identity)
    now = int(time.time())

    def create(conn: sqlite3.Connection) -> int:
        if conn.execute("SELECT 1 FROM variants WHERE id = ?", (variant_id,)).fetchone() is None:
            raise HTTPException(status_code=404, detail="Variant not found.")
        cursor = conn.execute(
            "INSERT INTO attempts (variant_id, seat_id, started_at) VALUES (?, ?, ?)",
            (variant_id, seat_id, now),
        )
        assert cursor.lastrowid is not None
        return int(cursor.lastrowid)

    attempt_id = await shards.course(course_id).run(create)
    return AttemptOut(attempt_id=attempt_id, variant_id=variant_id, started_at=now)


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
        # The span comes from the attempt row, never from the request: an
        # attempt that is not this seat's, or not this variant's, contributes
        # nothing rather than being trusted.
        started_at: int | None = None
        if body.attempt_id is not None:
            attempt = conn.execute(
                "SELECT started_at FROM attempts"
                " WHERE id = ? AND seat_id = ? AND variant_id = ?",
                (body.attempt_id, seat_id, variant_id),
            ).fetchone()
            if attempt is not None:
                started_at = int(attempt[0])
        cursor = conn.execute(
            "INSERT INTO submissions"
            " (variant_id, seat_id, page_count, storage_prefix, status,"
            "  submitted_at, started_at)"
            " VALUES (?, ?, ?, ?, 'pending', ?, ?)",
            (variant_id, seat_id, len(body.pages), prefix, now, started_at),
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

    def read(conn: sqlite3.Connection) -> tuple[str, str, list[tuple[int, str, str]]]:
        row = conn.execute(
            "SELECT storage_prefix, status FROM submissions WHERE id = ?",
            (submission_id,),
        ).fetchone()
        pages = conn.execute(
            "SELECT page_index, storage_key, content_type FROM submission_pages"
            " WHERE submission_id = ? ORDER BY page_index",
            (submission_id,),
        ).fetchall()
        return (
            str(row[0]),
            str(row[1]),
            [(int(p[0]), str(p[1]), str(p[2])) for p in pages],
        )

    storage_prefix, status, pages = await shards.course_reads(course_id).run(read)
    # The URL is signed over the declared content type, because the browser
    # sends Content-Type on the PUT and a signature that did not cover it is
    # rejected by the store (a 403 that looks like a permissions problem and is
    # not). It also pins the upload to the type the manifest declared, which the
    # limits were checked against.
    uploads = [
        UploadTarget(
            page_index=index,
            storage_key=key,
            url=storage.generate_presigned_url(
                "put_object",
                Params={
                    "Bucket": SCANS_BUCKET,
                    "Key": key,
                    "ContentType": content_type,
                },
                ExpiresIn=PRESIGN_TTL_SECONDS,
            ),
        )
        for index, key, content_type in pages
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


@router.get(
    "/submissions/{submission_id}/transcription",
    response_model=TranscriptionOut,
    responses={403: {"model": Problem}, 404: {"model": Problem}},
)
async def get_submission_transcription(
    submission_id: int,
    identity: Annotated[Identity, Depends(require_seat)],
    shards: Annotated[ShardManager, Depends(get_shards)],
) -> TranscriptionOut:
    """The recognized reading of a submission for the review preview (backend
    guide section 4 Stage 5): the aggregate markdown and each page's reading
    with region boxes and confidence. A seat reads only its own submission (a
    404 otherwise), and the scan stays the source of truth: this text is
    assistive. Empty until the worker has processed the pages."""
    course_id, seat_id = _seat_context(identity)
    return await _load_transcription(shards, course_id, submission_id, seat_id)


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
