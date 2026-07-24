"""PDF import endpoints (backend guide section 5, milestone 4.1). A professor
uploads a PDF straight to object storage via a presigned URL, then completes the
handshake to enqueue decode; the API never receives the bytes. Imports are an
authoring surface gated through ensure_course_owner, and they nest under the
course (decision 0013): per-shard import ids collide across courses, so a flat
/imports/{id} could not locate the shard.

4.1 stops at decode (page markdown, cached). Figure extraction (4.2),
segmentation (4.3), and the confirmation surface (4.4) build on these rows.
"""

import asyncio
import hashlib
import json
import sqlite3
import time
import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Response
from pydantic import BaseModel, Field

from app.auth.deps import get_shards, require_professor
from app.auth.models import Identity
from app.compression import compress_text, decompress_text
from app.courses.routes import ensure_course_owner
from app.db.shards import ShardManager
from app.imports.metrics import edit_distance
from app.problems import Problem
from app.storage import (
    IMPORTS_BUCKET,
    PRESIGN_TTL_SECONDS,
    ObjectStorage,
    fetch_bytes,
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


class ConfirmIn(BaseModel):
    # The professor's confirmed question text; None accepts the extraction as-is.
    # The edit distance from the extraction is logged as an accuracy metric (4.5).
    question_md: str | None = None
    # How many figure edits the professor made on the item (crop, reassign,
    # decorative, add), reported by the confirmation surface.
    figure_interventions: int = Field(default=0, ge=0)


class ConfirmedOut(BaseModel):
    item_id: int
    case_study_id: int
    state: str
    text_edit_distance: int


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
    body: ConfirmIn | None = None,
) -> ConfirmedOut:
    """Confirm a staged item into a draft case study (guide Stage 3). The
    confirmed question (the professor's edit, or the extraction as-is) becomes
    the case study body with its fig:// tokens intact; the item is marked
    confirmed and linked, keeping its figures alive through the purge. Two
    accuracy metrics are logged (4.5): the edit distance from the extraction, and
    the figure interventions the surface reports. Nothing copies automatically.
    Idempotent: re-confirming returns the same draft and its logged distance."""
    await ensure_course_owner(shards, course_id, identity)
    author_id = identity.user_id
    assert author_id is not None
    now = int(time.time())
    confirmed = body or ConfirmIn()

    def apply(conn: sqlite3.Connection) -> tuple[int, int, str, int]:
        row = conn.execute(
            "SELECT job_id, title, question_z, state, case_study_id"
            " FROM import_items WHERE id = ?",
            (item_id,),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Import item not found.")
        job_id, title, question_z, state, existing = row
        if state == "confirmed" and existing is not None:
            metric = conn.execute(
                "SELECT text_edit_distance FROM import_item_metrics WHERE item_id = ?",
                (item_id,),
            ).fetchone()
            return (item_id, int(existing), "confirmed", int(metric[0]) if metric else 0)

        extracted = decompress_text(conn, "problem_text", bytes(question_z))
        confirmed_body = (
            confirmed.question_md if confirmed.question_md is not None else extracted
        )
        distance = edit_distance(extracted, confirmed_body)
        cursor = conn.execute(
            "INSERT INTO case_studies"
            " (author_id, title, body_z, status, created_at, updated_at)"
            " VALUES (?, ?, ?, 'draft', ?, ?)",
            (
                author_id,
                str(title) if title else "Untitled item",
                compress_text(conn, "problem_text", confirmed_body),
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
        conn.execute(
            "INSERT INTO import_item_metrics"
            " (item_id, text_edit_distance, figure_interventions, recorded_at)"
            " VALUES (?, ?, ?, ?)"
            " ON CONFLICT(item_id) DO UPDATE SET"
            "   text_edit_distance = excluded.text_edit_distance,"
            "   figure_interventions = excluded.figure_interventions,"
            "   recorded_at = excluded.recorded_at",
            (item_id, distance, confirmed.figure_interventions, now),
        )
        return (item_id, case_study_id, "confirmed", distance)

    confirmed_item, case_study_id, state, distance = await shards.course(course_id).run(
        apply
    )
    return ConfirmedOut(
        item_id=confirmed_item,
        case_study_id=case_study_id,
        state=state,
        text_edit_distance=distance,
    )


# ------------------------------------------------------ figure verbs (4.4 rest)


class FigureRoleIn(BaseModel):
    role: Literal["essential", "decorative"] = "essential"


class AddBoxIn(BaseModel):
    page_index: int = Field(ge=0)
    bbox: tuple[float, float, float, float]  # normalised 0..1, top-left origin


class FigureCreatedOut(BaseModel):
    figure_id: int


@router.put(
    "/{course_id}/import-items/{item_id}/figures/{figure_id}",
    status_code=204,
    responses={401: {"model": Problem}, 403: {"model": Problem}, 404: {"model": Problem}},
)
async def set_item_figure(
    course_id: int,
    item_id: int,
    figure_id: int,
    identity: Annotated[Identity, Depends(require_professor)],
    shards: Annotated[ShardManager, Depends(get_shards)],
    body: FigureRoleIn | None = None,
) -> Response:
    """Assign a figure to an item, or set its role. `decorative` keeps the figure
    but excludes it from AI context (the professor's mark, guide Stage 3);
    reassigning is this PUT on the new item plus a DELETE on the old one."""
    await ensure_course_owner(shards, course_id, identity)
    role = (body or FigureRoleIn()).role

    def apply(conn: sqlite3.Connection) -> None:
        if conn.execute("SELECT 1 FROM import_items WHERE id = ?", (item_id,)).fetchone() is None:
            raise HTTPException(status_code=404, detail="Import item not found.")
        if conn.execute("SELECT 1 FROM figures WHERE id = ?", (figure_id,)).fetchone() is None:
            raise HTTPException(status_code=404, detail="Figure not found.")
        conn.execute(
            "INSERT INTO item_figures (item_id, figure_id, role) VALUES (?, ?, ?)"
            " ON CONFLICT(item_id, figure_id) DO UPDATE SET role = excluded.role",
            (item_id, figure_id, role),
        )

    await shards.course(course_id).run(apply)
    return Response(status_code=204)


@router.delete(
    "/{course_id}/import-items/{item_id}/figures/{figure_id}",
    status_code=204,
    responses={401: {"model": Problem}, 403: {"model": Problem}, 404: {"model": Problem}},
)
async def unassign_item_figure(
    course_id: int,
    item_id: int,
    figure_id: int,
    identity: Annotated[Identity, Depends(require_professor)],
    shards: Annotated[ShardManager, Depends(get_shards)],
) -> Response:
    """Remove a figure from an item (the figure row itself is content-addressed
    and stays; only this assignment goes)."""
    await ensure_course_owner(shards, course_id, identity)

    def apply(conn: sqlite3.Connection) -> None:
        cursor = conn.execute(
            "DELETE FROM item_figures WHERE item_id = ? AND figure_id = ?",
            (item_id, figure_id),
        )
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Figure not assigned to item.")

    await shards.course(course_id).run(apply)
    return Response(status_code=204)


@router.post(
    "/{course_id}/import-items/{item_id}/figures/from-box",
    status_code=201,
    response_model=FigureCreatedOut,
    responses={401: {"model": Problem}, 403: {"model": Problem}, 404: {"model": Problem}},
)
async def add_figure_from_box(
    course_id: int,
    item_id: int,
    body: AddBoxIn,
    identity: Annotated[Identity, Depends(require_professor)],
    shards: Annotated[ShardManager, Depends(get_shards)],
    storage: Annotated[ObjectStorage, Depends(get_object_storage)],
) -> FigureCreatedOut:
    """Add a figure the detectors missed by drawing a box on a page: the box is
    a raster crop of the page (a page_crop figure, never a re-render), stored
    content-addressed and assigned to the item."""
    await ensure_course_owner(shards, course_id, identity)
    now = int(time.time())

    def read(conn: sqlite3.Connection) -> str:
        item = conn.execute(
            "SELECT job_id FROM import_items WHERE id = ?", (item_id,)
        ).fetchone()
        if item is None:
            raise HTTPException(status_code=404, detail="Import item not found.")
        page = conn.execute(
            "SELECT image_key FROM import_pages WHERE job_id = ? AND page_index = ?",
            (int(item[0]), body.page_index),
        ).fetchone()
        if page is None:
            raise HTTPException(status_code=404, detail="Page not found.")
        return str(page[0])

    image_key = await shards.course_reads(course_id).run(read)
    raster = await asyncio.to_thread(fetch_bytes, storage, IMPORTS_BUCKET, image_key)

    from platform_core import pdf as _pdf

    _pw, _ph, regions = await asyncio.to_thread(_pdf.crop_figures, raster, [body.bbox])
    png, x, y, width, height = regions[0]
    content_hash = hashlib.sha256(png).hexdigest()
    storage_key = f"imports/{course_id}/figures/{content_hash}.png"
    await asyncio.to_thread(
        storage.put_object, Bucket=IMPORTS_BUCKET, Key=storage_key, Body=png
    )
    bbox_json = json.dumps([x, y, width, height])

    def write(conn: sqlite3.Connection) -> int:
        conn.execute(
            "INSERT OR IGNORE INTO figures"
            " (content_hash, storage_key, source, page, bbox, width_px, height_px,"
            "  created_at) VALUES (?, ?, 'page_crop', ?, ?, ?, ?, ?)",
            (content_hash, storage_key, body.page_index, bbox_json, width, height, now),
        )
        figure_id = int(
            conn.execute(
                "SELECT id FROM figures WHERE content_hash = ?", (content_hash,)
            ).fetchone()[0]
        )
        conn.execute(
            "INSERT OR IGNORE INTO item_figures (item_id, figure_id, role)"
            " VALUES (?, ?, 'essential')",
            (item_id, figure_id),
        )
        return figure_id

    return FigureCreatedOut(figure_id=await shards.course(course_id).run(write))
