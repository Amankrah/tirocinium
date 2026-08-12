"""The professor's submission review surface (milestone 8.1, backend guide
section 4 Stage 5).

The read half of 8.1: a list of a course's submissions as a review queue, and
a detail that serves the scan beside the transcription with the region boxes
and per-region confidence the surface hover-links and highlights from. The
grading action itself landed with 6.2 and lives in `app/mastery/routes.py`,
because a grade is evidence before it is a column.

Three rules shape the shapes here. A submission belongs to a seat, so the only
thing about a student that appears is the seat number, resolved from the
directory in Python because a shard may never join across to it. Page bytes
stay in object storage and travel as presigned URLs, never through the API. And
the scan remains the source of truth for grading: the original rendition is
served alongside the cleaned grayscale copy the model actually read, and the
recognized text is offered as assistive, not authoritative.

The variant's body and reference solution are deliberately not duplicated here;
`GET /courses/{id}/variants/{variant_id}` already serves both to the owner, and
the detail carries the `variant_id` to reach it.
"""

import json
import sqlite3
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth.deps import get_shards, require_professor
from app.auth.models import Identity
from app.compression import decompress_text
from app.courses.routes import ensure_course_owner
from app.db.shards import ShardManager
from app.problems import Problem
from app.storage import SCANS_BUCKET, ObjectStorage, get_object_storage, presigned_get
from app.submissions.routes import RegionOut

router = APIRouter(prefix="/api/v1/courses/{course_id}", tags=["submission-review"])

DEFAULT_LIMIT = 50
MAX_LIMIT = 200


class SubmissionSummary(BaseModel):
    """One row of the review queue. Labelled by seat number only: there is no
    per-student identity to show, by design (backend guide 7.1)."""

    id: int
    seat_number: str
    variant_id: int
    case_study_id: int
    case_study_title: str
    status: str
    page_count: int
    submitted_at: int
    started_at: int | None
    engaged_seconds: int | None
    recognition_conf: float | None
    grade: float | None
    graded_at: int | None


class SubmissionListOut(BaseModel):
    submissions: list[SubmissionSummary]
    next_cursor: int | None


class ReviewPageOut(BaseModel):
    """One page as the professor reads it: the scan itself, the cleaned
    rendition the model read, and that page's reading with its regions."""

    page_index: int
    image_url: str
    grayscale_url: str | None
    quality_status: str | None
    reject_reason: str | None
    confidence: float | None
    markdown: str
    regions: list[RegionOut]


class SubmissionReviewOut(BaseModel):
    id: int
    seat_number: str
    variant_id: int
    case_study_id: int
    case_study_title: str
    status: str
    submitted_at: int
    recognition_conf: float | None
    grade: float | None
    graded_at: int | None
    recognized_markdown: str | None
    pages: list[ReviewPageOut]


class PageRenditionsOut(BaseModel):
    """One page's presigned renditions, so an expired URL can be refreshed
    without refetching the whole review."""

    page_index: int
    image_url: str
    grayscale_url: str | None


class _PageRow(BaseModel):
    """The shard's view of a page, before storage keys become URLs."""

    page_index: int
    storage_key: str
    grayscale_key: str | None
    quality_status: str | None
    reject_reason: str | None
    confidence: float | None
    markdown: str
    regions: list[RegionOut]


async def _seat_numbers(
    shards: ShardManager, course_id: int, seat_ids: list[int]
) -> dict[int, str]:
    """Seats live in the directory and submissions live in the shard, so the
    join happens here rather than in SQL (no cross-shard joins). Scoped by
    course as well as id, so a stray seat id can never resolve to another
    course's seat."""
    if not seat_ids:
        return {}
    unique = sorted(set(seat_ids))
    placeholders = ", ".join("?" for _ in unique)

    def read(conn: sqlite3.Connection) -> dict[int, str]:
        rows = conn.execute(
            f"SELECT id, seat_number FROM seats WHERE course_id = ? AND id IN ({placeholders})",
            (course_id, *unique),
        ).fetchall()
        return {int(r[0]): str(r[1]) for r in rows}

    return await shards.directory_reads.run(read)


@router.get(
    "/submissions",
    response_model=SubmissionListOut,
    responses={401: {"model": Problem}, 403: {"model": Problem}, 404: {"model": Problem}},
)
async def list_submissions(
    course_id: int,
    identity: Annotated[Identity, Depends(require_professor)],
    shards: Annotated[ShardManager, Depends(get_shards)],
    status: str | None = None,
    variant_id: int | None = None,
    cursor: int | None = None,
    limit: int = DEFAULT_LIMIT,
) -> SubmissionListOut:
    """The course's submissions as a review queue, oldest first, filterable by
    status and by variant. Pending and processing work stays in the list: what
    is worth opening is the professor's call, not ours."""
    await ensure_course_owner(shards, course_id, identity)
    limit = max(1, min(int(limit), MAX_LIMIT))
    after = cursor if cursor is not None else 0

    filters = ""
    params: list[object] = [after]
    if status is not None:
        filters += " AND s.status = ?"
        params.append(status)
    if variant_id is not None:
        filters += " AND s.variant_id = ?"
        params.append(variant_id)

    def read(conn: sqlite3.Connection) -> tuple[list[tuple[object, ...]], int | None]:
        rows = conn.execute(
            "SELECT s.id, s.seat_id, s.variant_id, s.page_count, s.status,"
            " s.submitted_at, s.recognition_conf, s.grade, s.graded_at,"
            " v.case_study_id, cs.title, s.started_at"
            " FROM submissions s"
            " JOIN variants v ON v.id = s.variant_id"
            " JOIN case_studies cs ON cs.id = v.case_study_id"
            f" WHERE s.id > ?{filters} ORDER BY s.id LIMIT ?",
            (*params, limit + 1),
        ).fetchall()
        page = [tuple(r) for r in rows[:limit]]
        next_cursor = int(str(page[-1][0])) if len(rows) > limit else None
        return page, next_cursor

    page, next_cursor = await shards.course_reads(course_id).run(read)
    numbers = await _seat_numbers(shards, course_id, [int(str(r[1])) for r in page])
    return SubmissionListOut(
        submissions=[
            SubmissionSummary(
                id=int(str(r[0])),
                seat_number=numbers.get(int(str(r[1])), ""),
                variant_id=int(str(r[2])),
                case_study_id=int(str(r[9])),
                case_study_title=str(r[10]),
                status=str(r[4]),
                page_count=int(str(r[3])),
                submitted_at=int(str(r[5])),
                started_at=None if r[11] is None else int(str(r[11])),
                engaged_seconds=(
                    None if r[11] is None else max(0, int(str(r[5])) - int(str(r[11])))
                ),
                recognition_conf=None if r[6] is None else float(str(r[6])),
                grade=None if r[7] is None else float(str(r[7])),
                graded_at=None if r[8] is None else int(str(r[8])),
            )
            for r in page
        ],
        next_cursor=next_cursor,
    )


def _read_pages(conn: sqlite3.Connection, submission_id: int) -> list[_PageRow]:
    """Each page joined to its cached reading by the server-computed content
    hash (migration course/0008). A page the worker has not read yet simply has
    no match, so its markdown is empty and its regions absent."""
    rows = conn.execute(
        "SELECT sp.page_index, sp.storage_key, sp.grayscale_key, sp.quality_status,"
        " sp.reject_reason, pt.markdown_z, pt.confidence, pt.regions_json"
        " FROM submission_pages sp"
        " LEFT JOIN page_transcriptions pt ON sp.content_sha = pt.content_hash"
        " WHERE sp.submission_id = ? ORDER BY sp.page_index",
        (submission_id,),
    ).fetchall()
    return [
        _PageRow(
            page_index=int(r[0]),
            storage_key=str(r[1]),
            grayscale_key=None if r[2] is None else str(r[2]),
            quality_status=None if r[3] is None else str(r[3]),
            reject_reason=None if r[4] is None else str(r[4]),
            confidence=None if r[6] is None else float(r[6]),
            markdown="" if r[5] is None else decompress_text(conn, "handwriting", bytes(r[5])),
            regions=[]
            if r[7] is None
            else [RegionOut.model_validate(region) for region in json.loads(r[7])],
        )
        for r in rows
    ]


@router.get(
    "/submissions/{submission_id}",
    response_model=SubmissionReviewOut,
    responses={401: {"model": Problem}, 403: {"model": Problem}, 404: {"model": Problem}},
)
async def review_submission(
    course_id: int,
    submission_id: int,
    identity: Annotated[Identity, Depends(require_professor)],
    shards: Annotated[ShardManager, Depends(get_shards)],
    storage: Annotated[ObjectStorage, Depends(get_object_storage)],
) -> SubmissionReviewOut:
    """The scan beside the transcription (Stage 5). Every page carries its
    presigned scan URL and its reading with region boxes and per-region
    confidence, so the surface can hover-link between the two and highlight
    what the model was unsure of. Recognized text is assistive; the scan is
    what a grade is given against."""
    await ensure_course_owner(shards, course_id, identity)

    def read(
        conn: sqlite3.Connection,
    ) -> tuple[tuple[object, ...], list[_PageRow], str | None]:
        row = conn.execute(
            "SELECT s.id, s.seat_id, s.variant_id, s.status, s.submitted_at,"
            " s.recognition_conf, s.grade, s.graded_at, s.recognized_z,"
            " v.case_study_id, cs.title"
            " FROM submissions s"
            " JOIN variants v ON v.id = s.variant_id"
            " JOIN case_studies cs ON cs.id = v.case_study_id"
            " WHERE s.id = ?",
            (submission_id,),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Submission not found.")
        recognized = (
            None if row[8] is None else decompress_text(conn, "handwriting", bytes(row[8]))
        )
        return tuple(row), _read_pages(conn, submission_id), recognized

    row, pages, recognized = await shards.course_reads(course_id).run(read)
    numbers = await _seat_numbers(shards, course_id, [int(str(row[1]))])
    return SubmissionReviewOut(
        id=int(str(row[0])),
        seat_number=numbers.get(int(str(row[1])), ""),
        variant_id=int(str(row[2])),
        case_study_id=int(str(row[9])),
        case_study_title=str(row[10]),
        status=str(row[3]),
        submitted_at=int(str(row[4])),
        recognition_conf=None if row[5] is None else float(str(row[5])),
        grade=None if row[6] is None else float(str(row[6])),
        graded_at=None if row[7] is None else int(str(row[7])),
        recognized_markdown=recognized,
        pages=[
            ReviewPageOut(
                page_index=page.page_index,
                image_url=presigned_get(storage, SCANS_BUCKET, page.storage_key),
                grayscale_url=None
                if page.grayscale_key is None
                else presigned_get(storage, SCANS_BUCKET, page.grayscale_key),
                quality_status=page.quality_status,
                reject_reason=page.reject_reason,
                confidence=page.confidence,
                markdown=page.markdown,
                regions=page.regions,
            )
            for page in pages
        ],
    )


@router.get(
    "/submissions/{submission_id}/pages/{page_index}",
    response_model=PageRenditionsOut,
    responses={401: {"model": Problem}, 403: {"model": Problem}, 404: {"model": Problem}},
)
async def submission_page_renditions(
    course_id: int,
    submission_id: int,
    page_index: int,
    identity: Annotated[Identity, Depends(require_professor)],
    shards: Annotated[ShardManager, Depends(get_shards)],
    storage: Annotated[ObjectStorage, Depends(get_object_storage)],
) -> PageRenditionsOut:
    """Fresh presigned URLs for one page. Presigned links are short-lived, and
    a long review session outlives them; refreshing one page should not mean
    refetching the whole submission."""
    await ensure_course_owner(shards, course_id, identity)

    def read(conn: sqlite3.Connection) -> tuple[str, str | None]:
        row = conn.execute(
            "SELECT sp.storage_key, sp.grayscale_key FROM submission_pages sp"
            " JOIN submissions s ON s.id = sp.submission_id"
            " WHERE sp.submission_id = ? AND sp.page_index = ?",
            (submission_id, page_index),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Page not found.")
        return str(row[0]), None if row[1] is None else str(row[1])

    storage_key, grayscale_key = await shards.course_reads(course_id).run(read)
    return PageRenditionsOut(
        page_index=page_index,
        image_url=presigned_get(storage, SCANS_BUCKET, storage_key),
        grayscale_url=None
        if grayscale_key is None
        else presigned_get(storage, SCANS_BUCKET, grayscale_key),
    )
