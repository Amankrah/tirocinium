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
from app.compression import compress_text, decompress_text
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


# ------------------------------------------------ staged items and confirmation


class ImportItemOut(BaseModel):
    id: int
    title: str | None
    question_md: str
    solution_md: str | None
    page_span: str
    confidence: float
    notes: str | None
    state: str
    figure_ids: list[int]
    case_study_id: int | None


class ImportItemsOut(BaseModel):
    items: list[ImportItemOut]


class ConfirmedOut(BaseModel):
    item_id: int
    case_study_id: int
    state: str


@router.get(
    "/{course_id}/imports/{import_id}/items",
    response_model=ImportItemsOut,
    responses={401: {"model": Problem}, 403: {"model": Problem}, 404: {"model": Problem}},
)
async def list_import_items(
    course_id: int,
    import_id: int,
    identity: Annotated[Identity, Depends(require_professor)],
    shards: Annotated[ShardManager, Depends(get_shards)],
) -> ImportItemsOut:
    """The staged items of an import, for the confirmation surface (4.4): each
    item's question and solution markdown (fig:// tokens intact), its figure
    assignments, confidence, the model's notes, and its state."""
    await ensure_course_owner(shards, course_id, identity)
    await _load_import(shards, course_id, import_id)  # 404 if the import is not here

    def read(conn: sqlite3.Connection) -> list[ImportItemOut]:
        rows = conn.execute(
            "SELECT id, title, question_z, solution_z, page_span, confidence, notes,"
            " state, case_study_id FROM import_items WHERE job_id = ? ORDER BY id",
            (import_id,),
        ).fetchall()
        items: list[ImportItemOut] = []
        for row in rows:
            figure_ids = [
                int(fr[0])
                for fr in conn.execute(
                    "SELECT figure_id FROM item_figures WHERE item_id = ? ORDER BY figure_id",
                    (row[0],),
                ).fetchall()
            ]
            items.append(
                ImportItemOut(
                    id=int(row[0]),
                    title=None if row[1] is None else str(row[1]),
                    question_md=decompress_text(conn, "problem_text", bytes(row[2])),
                    solution_md=None
                    if row[3] is None
                    else decompress_text(conn, "problem_text", bytes(row[3])),
                    page_span=str(row[4]),
                    confidence=float(row[5]),
                    notes=None if row[6] is None else str(row[6]),
                    state=str(row[7]),
                    figure_ids=figure_ids,
                    case_study_id=None if row[8] is None else int(row[8]),
                )
            )
        return items

    return ImportItemsOut(items=await shards.course_reads(course_id).run(read))


@router.post(
    "/{course_id}/import-items/{item_id}/confirm",
    response_model=ConfirmedOut,
    responses={401: {"model": Problem}, 403: {"model": Problem}, 404: {"model": Problem}},
)
async def confirm_import_item(
    course_id: int,
    item_id: int,
    identity: Annotated[Identity, Depends(require_professor)],
    shards: Annotated[ShardManager, Depends(get_shards)],
) -> ConfirmedOut:
    """Confirm a staged item into a draft case study (guide Stage 3): the item's
    question becomes the case study body with its fig:// tokens intact, and the
    item is marked confirmed and linked, which keeps its figures alive through
    the purge. Nothing copies automatically; this is the professor's action.
    Idempotent: re-confirming returns the same draft."""
    await ensure_course_owner(shards, course_id, identity)
    author_id = identity.user_id
    assert author_id is not None
    now = int(time.time())

    def apply(conn: sqlite3.Connection) -> tuple[int, int, str]:
        row = conn.execute(
            "SELECT job_id, title, question_z, state, case_study_id"
            " FROM import_items WHERE id = ?",
            (item_id,),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Import item not found.")
        job_id, title, question_z, state, existing = row
        if state == "confirmed" and existing is not None:
            return (item_id, int(existing), "confirmed")
        cursor = conn.execute(
            "INSERT INTO case_studies"
            " (author_id, title, body_z, status, created_at, updated_at)"
            " VALUES (?, ?, ?, 'draft', ?, ?)",
            (
                author_id,
                str(title) if title else "Untitled item",
                compress_text(
                    conn,
                    "problem_text",
                    decompress_text(conn, "problem_text", bytes(question_z)),
                ),
                now,
                now,
            ),
        )
        case_study_id = int(cursor.lastrowid or 0)
        conn.execute(
            "UPDATE import_items SET state = 'confirmed', case_study_id = ? WHERE id = ?",
            (case_study_id, item_id),
        )
        # Confirming from a job keeps the whole job (and so its confirmed item's
        # figures) out of the 30-day purge, which keys on job status.
        conn.execute(
            "UPDATE import_jobs SET status = 'confirmed' WHERE id = ?", (int(job_id),)
        )
        return (item_id, case_study_id, "confirmed")

    confirmed_item, case_study_id, state = await shards.course(course_id).run(apply)
    return ConfirmedOut(item_id=confirmed_item, case_study_id=case_study_id, state=state)
