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
from typing import Annotated, Literal, NamedTuple

from fastapi import APIRouter, Depends, Header, HTTPException, Response
from pydantic import BaseModel, Field

from app.auth.deps import current_identity, get_shards, require_professor
from app.auth.models import Identity
from app.compression import compress_text, decompress_text
from app.courses.routes import ensure_course_owner, ensure_course_reader
from app.db.shards import ShardManager
from app.imports.figures import normalized_bbox
from app.imports.metrics import edit_distance
from app.problems import Problem
from app.storage import (
    IMPORTS_BUCKET,
    PRESIGN_TTL_SECONDS,
    ObjectStorage,
    fetch_bytes,
    get_object_storage,
    presigned_get,
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


class ItemFigureOut(BaseModel):
    """A figure assigned to an item, with a presigned GET of its lossless crop so
    the confirmation surface can render it. `bbox` is normalised 0..1 (top-left),
    the same frame `from-box` takes back. `token` is the fig:// token sitting in
    the item's question_md, so the surface can render it inline at its position."""

    figure_id: int
    token: str
    role: str
    source: str
    image_url: str
    image_url_2x: str | None
    width_px: int
    height_px: int
    page: int | None
    bbox: tuple[float, float, float, float] | None
    caption: str | None


class ImportPageOut(BaseModel):
    page_index: int
    image_url: str


class ImportItemOut(BaseModel):
    id: int
    title: str | None
    question_md: str
    solution_md: str | None
    page_span: str
    confidence: float
    notes: str | None
    state: str
    figures: list[ItemFigureOut]
    case_study_id: int | None


class ImportItemsOut(BaseModel):
    items: list[ImportItemOut]
    pages: list[ImportPageOut]


class ConfirmIn(BaseModel):
    # The professor's confirmed question text; None accepts the extraction as-is.
    # The edit distance from the extraction is logged as an accuracy metric (4.5).
    question_md: str | None = None
    # The professor's confirmed solution text; None leaves the extracted solution
    # untouched. The card's solution pane is editable too (frontend guide 4.3), so
    # a misread solution can be fixed here; the fix is saved back onto the item.
    solution_md: str | None = None
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
    storage: Annotated[ObjectStorage, Depends(get_object_storage)],
) -> ImportItemsOut:
    """The staged items of an import, for the confirmation surface (4.4): each
    item's question and solution markdown (fig:// tokens intact), its figures
    with presigned crop URLs, confidence, the model's notes, and its state, plus
    the job's source pages with presigned images for the review canvas."""
    await ensure_course_owner(shards, course_id, identity)
    await _load_import(shards, course_id, import_id)  # 404 if the import is not here

    def read(conn: sqlite3.Connection) -> ImportItemsOut:
        pages = [
            ImportPageOut(
                page_index=int(p[0]),
                image_url=presigned_get(storage, IMPORTS_BUCKET, str(p[1])),
            )
            for p in conn.execute(
                "SELECT page_index, image_key FROM import_pages"
                " WHERE job_id = ? ORDER BY page_index",
                (import_id,),
            ).fetchall()
        ]
        # Discarded and merged items leave the review: a discarded item is
        # rejected, a merged one now lives inside its survivor. Pending and
        # confirmed stay, so the surface still shows "N of M confirmed".
        rows = conn.execute(
            "SELECT id, title, question_z, solution_z, page_span, confidence, notes,"
            " state, case_study_id FROM import_items WHERE job_id = ?"
            " AND state NOT IN ('discarded', 'merged') ORDER BY id",
            (import_id,),
        ).fetchall()
        items: list[ImportItemOut] = []
        for row in rows:
            figure_rows = conn.execute(
                "SELECT itf.figure_id, itf.role, f.source, f.storage_key,"
                " f.storage_key_2x, f.width_px, f.height_px, f.page, f.bbox, f.caption"
                " FROM item_figures itf JOIN figures f ON itf.figure_id = f.id"
                " WHERE itf.item_id = ? ORDER BY itf.figure_id",
                (row[0],),
            ).fetchall()
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
                    figures=[_item_figure(storage, fr) for fr in figure_rows],
                    case_study_id=None if row[8] is None else int(row[8]),
                )
            )
        return ImportItemsOut(items=items, pages=pages)

    return await shards.course_reads(course_id).run(read)


def _item_figure(storage: ObjectStorage, row: tuple) -> ItemFigureOut:  # type: ignore[type-arg]
    figure_id, role, source, storage_key, storage_key_2x, width_px, height_px = row[:7]
    page, bbox_json, caption = row[7:]
    bbox: tuple[float, float, float, float] | None = None
    if bbox_json is not None:
        values = json.loads(bbox_json)
        bbox = (float(values[0]), float(values[1]), float(values[2]), float(values[3]))
    return ItemFigureOut(
        figure_id=int(figure_id),
        token=f"fig://{int(figure_id)}",
        role=str(role),
        source=str(source),
        image_url=presigned_get(storage, IMPORTS_BUCKET, str(storage_key)),
        image_url_2x=None
        if storage_key_2x is None
        else presigned_get(storage, IMPORTS_BUCKET, str(storage_key_2x)),
        width_px=int(width_px),
        height_px=int(height_px),
        page=None if page is None else int(page),
        bbox=bbox,
        caption=None if caption is None else str(caption),
    )


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
        if state == "discarded":
            raise HTTPException(status_code=409, detail="This item was discarded.")
        if state == "merged":
            raise HTTPException(
                status_code=409, detail="This item was merged into another."
            )
        if confirmed.solution_md is not None:
            conn.execute(
                "UPDATE import_items SET solution_z = ? WHERE id = ?",
                (compress_text(conn, "problem_text", confirmed.solution_md), item_id),
            )
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
    image_url: str
    width_px: int
    height_px: int


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

    page_width, page_height, regions = await asyncio.to_thread(
        _pdf.crop_figures, raster, [body.bbox]
    )
    png, x, y, width, height = regions[0]
    content_hash = hashlib.sha256(png).hexdigest()
    storage_key = f"imports/{course_id}/figures/{content_hash}.png"
    await asyncio.to_thread(
        storage.put_object, Bucket=IMPORTS_BUCKET, Key=storage_key, Body=png
    )
    # Store the actual (clamped) crop normalised 0..1, the one bbox frame across
    # sources (decision 0032), so the surface can redraw the box on the page.
    bbox_json = json.dumps(
        normalized_bbox(
            (float(x), float(y), float(width), float(height)),
            float(page_width),
            float(page_height),
        )
    )

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

    figure_id = await shards.course(course_id).run(write)
    return FigureCreatedOut(
        figure_id=figure_id,
        image_url=presigned_get(storage, IMPORTS_BUCKET, storage_key),
        width_px=width,
        height_px=height,
    )


# ------------------------------------------------- figure resolve (both surfaces)


class FigureImageOut(BaseModel):
    figure_id: int
    source: str
    image_url: str
    image_url_2x: str | None
    width_px: int
    height_px: int


@router.get(
    "/{course_id}/figures/{figure_id}",
    response_model=FigureImageOut,
    responses={401: {"model": Problem}, 403: {"model": Problem}, 404: {"model": Problem}},
)
async def resolve_figure_image(
    course_id: int,
    figure_id: int,
    identity: Annotated[Identity, Depends(current_identity)],
    shards: Annotated[ShardManager, Depends(get_shards)],
    storage: Annotated[ObjectStorage, Depends(get_object_storage)],
) -> FigureImageOut:
    """Resolve one figure to a presigned image URL. This is what the confirmation
    surface and the reading surface's fig:// resolver (decision 0014) point at.
    A professor who owns the course resolves any figure in it (drafts included);
    a seat resolves a figure only when it is carried by a published case study,
    the same visibility rule as the case study body it sits in. The bytes are the
    professor's own source, served straight from storage, never through the API."""
    can_see_drafts = await ensure_course_reader(shards, course_id, identity)

    def read(conn: sqlite3.Connection) -> tuple[str, str | None, int, int, str]:
        row = conn.execute(
            "SELECT storage_key, storage_key_2x, width_px, height_px, source"
            " FROM figures WHERE id = ?",
            (figure_id,),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Figure not found.")
        if not can_see_drafts:
            # A seat may only resolve a figure that a published case study carries
            # (figure -> item_figures -> confirmed item -> published case study).
            published = conn.execute(
                "SELECT 1 FROM item_figures itf"
                " JOIN import_items ii ON itf.item_id = ii.id"
                " JOIN case_studies cs ON ii.case_study_id = cs.id"
                " WHERE itf.figure_id = ? AND cs.status = 'published' LIMIT 1",
                (figure_id,),
            ).fetchone()
            if published is None:
                # Indistinguishable from a missing figure, so an unpublished
                # figure never leaks its existence to a student.
                raise HTTPException(status_code=404, detail="Figure not found.")
        return (
            str(row[0]),
            None if row[1] is None else str(row[1]),
            int(row[2]),
            int(row[3]),
            str(row[4]),
        )

    storage_key, storage_key_2x, width_px, height_px, source = await shards.course_reads(
        course_id
    ).run(read)
    return FigureImageOut(
        figure_id=figure_id,
        source=source,
        image_url=presigned_get(storage, IMPORTS_BUCKET, storage_key),
        image_url_2x=None
        if storage_key_2x is None
        else presigned_get(storage, IMPORTS_BUCKET, storage_key_2x),
        width_px=width_px,
        height_px=height_px,
    )


# ------------------------------------------------- item verbs (4.4): merge, discard


class MergeIn(BaseModel):
    # The sibling item to absorb into this one, for a question the segmenter split
    # across two items (frontend guide 4.3: "merge with the next item"). Its text
    # is appended, its figures move over, and it leaves the review as `merged`.
    source_item_id: int


class MergedOut(BaseModel):
    survivor_id: int
    merged_item_id: int
    question_md: str
    solution_md: str | None
    page_span: str
    confidence: float


def _join_markdown(first: str | None, second: str | None) -> str | None:
    """Concatenate two markdown bodies as consecutive blocks, dropping a side that
    is absent. fig:// tokens ride along untouched."""
    parts = [part for part in (first, second) if part is not None]
    return "\n\n".join(parts) if parts else None


@router.post(
    "/{course_id}/import-items/{item_id}/merge",
    response_model=MergedOut,
    responses={
        400: {"model": Problem},
        401: {"model": Problem},
        403: {"model": Problem},
        404: {"model": Problem},
        409: {"model": Problem},
    },
)
async def merge_import_items(
    course_id: int,
    item_id: int,
    body: MergeIn,
    identity: Annotated[Identity, Depends(require_professor)],
    shards: Annotated[ShardManager, Depends(get_shards)],
) -> MergedOut:
    """Merge a sibling item into this one (guide Stage 3), for a single question
    the segmenter split. This item is the survivor: the source's question (and
    solution) markdown is appended with its fig:// tokens intact, the source's
    figures move onto this item, the page span and notes combine, and the source
    leaves the review as `merged`. A link-and-state edit only (decision 0034); no
    figure is re-cropped and no bytes change. Both items must be pending: a retry
    finds the source already `merged` and 409s, so a double-submit cannot append
    twice."""
    await ensure_course_owner(shards, course_id, identity)
    if body.source_item_id == item_id:
        raise HTTPException(status_code=400, detail="An item cannot merge into itself.")

    def apply(conn: sqlite3.Connection) -> tuple[str, str | None, str, float]:
        survivor = _load_mergeable(conn, item_id, "Import item not found.")
        source = _load_mergeable(conn, body.source_item_id, "Source item not found.")
        if survivor.job_id != source.job_id:
            raise HTTPException(
                status_code=409, detail="Items from different imports cannot be merged."
            )

        question = _join_markdown(
            decompress_text(conn, "problem_text", survivor.question_z),
            decompress_text(conn, "problem_text", source.question_z),
        )
        assert question is not None  # both questions are NOT NULL
        solution = _join_markdown(
            _maybe_text(conn, survivor.solution_z),
            _maybe_text(conn, source.solution_z),
        )
        page_span = (
            survivor.page_span
            if survivor.page_span == source.page_span
            else f"{survivor.page_span}, {source.page_span}"
        )
        confidence = min(survivor.confidence, source.confidence)
        notes = _join_notes(survivor.notes, source.notes)

        conn.execute(
            "UPDATE import_items SET question_z = ?, solution_z = ?, page_span = ?,"
            " confidence = ?, notes = ? WHERE id = ?",
            (
                compress_text(conn, "problem_text", question),
                None if solution is None else compress_text(conn, "problem_text", solution),
                page_span,
                confidence,
                notes,
                item_id,
            ),
        )
        # Move the source's figures onto the survivor (its own role wins a clash),
        # then unlink the source and retire it.
        conn.execute(
            "INSERT OR IGNORE INTO item_figures (item_id, figure_id, role)"
            " SELECT ?, figure_id, role FROM item_figures WHERE item_id = ?",
            (item_id, body.source_item_id),
        )
        conn.execute(
            "DELETE FROM item_figures WHERE item_id = ?", (body.source_item_id,)
        )
        conn.execute(
            "UPDATE import_items SET state = 'merged' WHERE id = ?", (body.source_item_id,)
        )
        return question, solution, page_span, confidence

    question, solution, page_span, confidence = await shards.course(course_id).run(apply)
    return MergedOut(
        survivor_id=item_id,
        merged_item_id=body.source_item_id,
        question_md=question,
        solution_md=solution,
        page_span=page_span,
        confidence=confidence,
    )


class _Mergeable(NamedTuple):
    job_id: int
    question_z: bytes
    solution_z: bytes | None
    page_span: str
    confidence: float
    notes: str | None


def _load_mergeable(
    conn: sqlite3.Connection, item_id: int, missing_detail: str
) -> _Mergeable:
    """Fetch an item that must be `pending` to take part in a merge, raising the
    right problem otherwise: 404 if absent, 409 if already confirmed, discarded,
    or merged (so a merge retry on a now-`merged` source is a clean 409)."""
    row = conn.execute(
        "SELECT job_id, question_z, solution_z, page_span, confidence, notes, state"
        " FROM import_items WHERE id = ?",
        (item_id,),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail=missing_detail)
    state = str(row[6])
    if state != "pending":
        detail = {
            "confirmed": "A confirmed item cannot be merged.",
            "discarded": "A discarded item cannot be merged.",
            "merged": "This item was already merged.",
        }.get(state, "This item cannot be merged.")
        raise HTTPException(status_code=409, detail=detail)
    return _Mergeable(
        job_id=int(row[0]),
        question_z=bytes(row[1]),
        solution_z=None if row[2] is None else bytes(row[2]),
        page_span=str(row[3]),
        confidence=float(row[4]),
        notes=None if row[5] is None else str(row[5]),
    )


def _maybe_text(conn: sqlite3.Connection, blob: bytes | None) -> str | None:
    return None if blob is None else decompress_text(conn, "problem_text", blob)


def _join_notes(first: str | None, second: str | None) -> str | None:
    parts = [part for part in (first, second) if part is not None]
    return "; ".join(parts) if parts else None


@router.post(
    "/{course_id}/import-items/{item_id}/discard",
    status_code=204,
    responses={
        401: {"model": Problem},
        403: {"model": Problem},
        404: {"model": Problem},
        409: {"model": Problem},
    },
)
async def discard_import_item(
    course_id: int,
    item_id: int,
    identity: Annotated[Identity, Depends(require_professor)],
    shards: Annotated[ShardManager, Depends(get_shards)],
) -> Response:
    """Discard a spurious staged item (guide Stage 3): it leaves the review and is
    purged with the job at 30 days. A state edit only, not a delete, so the item
    stays for the purge and its metrics. Idempotent on an already-discarded item;
    a confirmed one is refused (unpublish or delete the draft instead), and a
    merged one is already gone."""
    await ensure_course_owner(shards, course_id, identity)

    def apply(conn: sqlite3.Connection) -> None:
        row = conn.execute(
            "SELECT state FROM import_items WHERE id = ?", (item_id,)
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Import item not found.")
        state = str(row[0])
        if state == "discarded":
            return  # idempotent
        if state == "confirmed":
            raise HTTPException(
                status_code=409, detail="A confirmed item cannot be discarded."
            )
        if state == "merged":
            raise HTTPException(
                status_code=409, detail="A merged item cannot be discarded."
            )
        conn.execute(
            "UPDATE import_items SET state = 'discarded' WHERE id = ?", (item_id,)
        )

    await shards.course(course_id).run(apply)
    return Response(status_code=204)
