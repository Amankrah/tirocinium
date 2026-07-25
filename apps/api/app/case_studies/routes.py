"""Case study CRUD, publish states, and case-to-concept mappings (milestone
2.1). Bodies are markdown compressed through the codec at rest (backend guide
3.3); the plaintext lives only in transit. Everything is nested under the
course because per-shard integer ids collide across courses (decision 0013).

Publishing here is the state transition only. Pre-generating the verified
variant pool on publish is a Phase 5 concern (backend guide 6.3); this
milestone stops at draft to published and back.
"""

import sqlite3
import time
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field

from app.auth.deps import current_identity, get_shards, require_professor
from app.auth.models import Identity
from app.compression import compress_text, decompress_text
from app.courses.routes import ensure_course_owner, ensure_course_reader
from app.db.shards import ShardManager
from app.problems import Problem
from app.tasks import TaskQueue, get_task_queue

router = APIRouter(
    prefix="/api/v1/courses/{course_id}/case-studies", tags=["case-studies"]
)

DEFAULT_LIMIT = 50
MAX_LIMIT = 100


class CaseStudyIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1)


class CaseStudyUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    body: str | None = Field(default=None, min_length=1)


class ConceptTag(BaseModel):
    """A case study's mapping to one concept, as the reading surfaces show it
    (mastery spec section 2: weight in (0, 1], independent, not normalized)."""

    concept_id: int
    name: str
    weight: float


class CaseStudySummary(BaseModel):
    id: int
    title: str
    status: str
    created_at: int
    updated_at: int
    concepts: list[ConceptTag]


class CaseStudyDetail(CaseStudySummary):
    body: str


class CaseStudyListOut(BaseModel):
    items: list[CaseStudySummary]
    next_cursor: int | None


class MappingIn(BaseModel):
    concept_id: int
    weight: float = Field(gt=0, le=1)


class MappingsIn(BaseModel):
    mappings: list[MappingIn]


def _tags(conn: sqlite3.Connection, case_study_id: int) -> list[ConceptTag]:
    rows = conn.execute(
        "SELECT csc.concept_id, c.name, csc.weight"
        " FROM case_study_concepts csc JOIN concepts c ON c.id = csc.concept_id"
        " WHERE csc.case_study_id = ?"
        " ORDER BY csc.weight DESC, csc.concept_id",
        (case_study_id,),
    ).fetchall()
    return [
        ConceptTag(concept_id=int(r[0]), name=str(r[1]), weight=float(r[2]))
        for r in rows
    ]


async def _load_detail(
    shards: ShardManager, course_id: int, case_study_id: int, can_see_drafts: bool
) -> CaseStudyDetail:
    def read(conn: sqlite3.Connection) -> CaseStudyDetail:
        row = conn.execute(
            "SELECT id, title, body_z, status, created_at, updated_at"
            " FROM case_studies WHERE id = ?",
            (case_study_id,),
        ).fetchone()
        if row is None or (not can_see_drafts and str(row[3]) != "published"):
            raise HTTPException(status_code=404, detail="Case study not found.")
        return CaseStudyDetail(
            id=int(row[0]),
            title=str(row[1]),
            body=decompress_text(conn, "problem_text", bytes(row[2])),
            status=str(row[3]),
            created_at=int(row[4]),
            updated_at=int(row[5]),
            concepts=_tags(conn, case_study_id),
        )

    return await shards.course_reads(course_id).run(read)


@router.get(
    "",
    response_model=CaseStudyListOut,
    responses={403: {"model": Problem}, 404: {"model": Problem}},
)
async def list_case_studies(
    course_id: int,
    identity: Annotated[Identity, Depends(current_identity)],
    shards: Annotated[ShardManager, Depends(get_shards)],
    cursor: int | None = None,
    limit: int = DEFAULT_LIMIT,
) -> CaseStudyListOut:
    can_see_drafts = await ensure_course_reader(shards, course_id, identity)
    limit = max(1, min(int(limit), MAX_LIMIT))
    after = cursor if cursor is not None else 0
    published_only = "" if can_see_drafts else " AND status = 'published'"

    def read(conn: sqlite3.Connection) -> tuple[list[CaseStudySummary], int | None]:
        rows = conn.execute(
            "SELECT id, title, status, created_at, updated_at FROM case_studies"
            f" WHERE id > ?{published_only} ORDER BY id LIMIT ?",
            (after, limit + 1),
        ).fetchall()
        page = rows[:limit]
        items = [
            CaseStudySummary(
                id=int(r[0]),
                title=str(r[1]),
                status=str(r[2]),
                created_at=int(r[3]),
                updated_at=int(r[4]),
                concepts=_tags(conn, int(r[0])),
            )
            for r in page
        ]
        next_cursor = int(page[-1][0]) if len(rows) > limit else None
        return items, next_cursor

    items, next_cursor = await shards.course_reads(course_id).run(read)
    return CaseStudyListOut(items=items, next_cursor=next_cursor)


@router.post(
    "",
    status_code=201,
    response_model=CaseStudyDetail,
    responses={403: {"model": Problem}, 404: {"model": Problem}},
)
async def create_case_study(
    course_id: int,
    body: CaseStudyIn,
    identity: Annotated[Identity, Depends(require_professor)],
    shards: Annotated[ShardManager, Depends(get_shards)],
) -> CaseStudyDetail:
    await ensure_course_owner(shards, course_id, identity)
    now = int(time.time())
    author_id = identity.user_id
    assert author_id is not None

    def insert(conn: sqlite3.Connection) -> int:
        cursor = conn.execute(
            "INSERT INTO case_studies"
            " (author_id, title, body_z, status, created_at, updated_at)"
            " VALUES (?, ?, ?, 'draft', ?, ?)",
            (
                author_id,
                body.title,
                compress_text(conn, "problem_text", body.body),
                now,
                now,
            ),
        )
        assert cursor.lastrowid is not None
        return cursor.lastrowid

    case_study_id = await shards.course(course_id).run(insert)
    return await _load_detail(shards, course_id, case_study_id, can_see_drafts=True)


@router.get(
    "/{case_study_id}",
    response_model=CaseStudyDetail,
    responses={403: {"model": Problem}, 404: {"model": Problem}},
)
async def get_case_study(
    course_id: int,
    case_study_id: int,
    identity: Annotated[Identity, Depends(current_identity)],
    shards: Annotated[ShardManager, Depends(get_shards)],
) -> CaseStudyDetail:
    can_see_drafts = await ensure_course_reader(shards, course_id, identity)
    return await _load_detail(shards, course_id, case_study_id, can_see_drafts)


@router.patch(
    "/{case_study_id}",
    response_model=CaseStudyDetail,
    responses={403: {"model": Problem}, 404: {"model": Problem}},
)
async def update_case_study(
    course_id: int,
    case_study_id: int,
    body: CaseStudyUpdate,
    identity: Annotated[Identity, Depends(require_professor)],
    shards: Annotated[ShardManager, Depends(get_shards)],
) -> CaseStudyDetail:
    await ensure_course_owner(shards, course_id, identity)
    now = int(time.time())

    def update(conn: sqlite3.Connection) -> None:
        exists = conn.execute(
            "SELECT 1 FROM case_studies WHERE id = ?", (case_study_id,)
        ).fetchone()
        if exists is None:
            raise HTTPException(status_code=404, detail="Case study not found.")
        sets = ["updated_at = ?"]
        values: list[object] = [now]
        if body.title is not None:
            sets.append("title = ?")
            values.append(body.title)
        if body.body is not None:
            sets.append("body_z = ?")
            values.append(compress_text(conn, "problem_text", body.body))
        values.append(case_study_id)
        conn.execute(
            f"UPDATE case_studies SET {', '.join(sets)} WHERE id = ?", values
        )

    await shards.course(course_id).run(update)
    return await _load_detail(shards, course_id, case_study_id, can_see_drafts=True)


@router.delete(
    "/{case_study_id}",
    status_code=204,
    responses={
        403: {"model": Problem},
        404: {"model": Problem},
        409: {"model": Problem},
    },
)
async def delete_case_study(
    course_id: int,
    case_study_id: int,
    identity: Annotated[Identity, Depends(require_professor)],
    shards: Annotated[ShardManager, Depends(get_shards)],
) -> Response:
    await ensure_course_owner(shards, course_id, identity)

    def delete(conn: sqlite3.Connection) -> None:
        exists = conn.execute(
            "SELECT 1 FROM case_studies WHERE id = ?", (case_study_id,)
        ).fetchone()
        if exists is None:
            raise HTTPException(status_code=404, detail="Case study not found.")
        conn.execute(
            "DELETE FROM case_study_concepts WHERE case_study_id = ?",
            (case_study_id,),
        )
        try:
            conn.execute(
                "DELETE FROM case_studies WHERE id = ?", (case_study_id,)
            )
        except sqlite3.IntegrityError as exc:
            # Variants (Phase 5) reference the case study; refuse rather than
            # orphan a student's practice pool.
            raise HTTPException(
                status_code=409,
                detail="This case study has generated variants; unpublish it first.",
            ) from exc

    await shards.course(course_id).run(delete)
    return Response(status_code=204)


async def _set_status(
    shards: ShardManager, course_id: int, case_study_id: int, status: str
) -> CaseStudyDetail:
    now = int(time.time())

    def apply(conn: sqlite3.Connection) -> None:
        exists = conn.execute(
            "SELECT 1 FROM case_studies WHERE id = ?", (case_study_id,)
        ).fetchone()
        if exists is None:
            raise HTTPException(status_code=404, detail="Case study not found.")
        conn.execute(
            "UPDATE case_studies SET status = ?, updated_at = ? WHERE id = ?",
            (status, now, case_study_id),
        )

    await shards.course(course_id).run(apply)
    return await _load_detail(shards, course_id, case_study_id, can_see_drafts=True)


@router.post(
    "/{case_study_id}/publish",
    response_model=CaseStudyDetail,
    responses={403: {"model": Problem}, 404: {"model": Problem}},
)
async def publish_case_study(
    course_id: int,
    case_study_id: int,
    identity: Annotated[Identity, Depends(require_professor)],
    shards: Annotated[ShardManager, Depends(get_shards)],
    queue: Annotated[TaskQueue, Depends(get_task_queue)],
) -> CaseStudyDetail:
    await ensure_course_owner(shards, course_id, identity)
    detail = await _set_status(shards, course_id, case_study_id, "published")

    # Publishing a parameterized case study pre-generates its variant pool
    # (guide 6.3: default 20 verified variants, asynchronously), so students
    # never wait on generation. Without a spec there is nothing to fill.
    def has_spec(conn: sqlite3.Connection) -> bool:
        row = conn.execute(
            "SELECT param_spec_z FROM case_studies WHERE id = ?",
            (case_study_id,),
        ).fetchone()
        return row is not None and row[0] is not None

    if await shards.course_reads(course_id).run(has_spec):
        await queue.enqueue_fill_pool(course_id, case_study_id)
    return detail


@router.post(
    "/{case_study_id}/unpublish",
    response_model=CaseStudyDetail,
    responses={403: {"model": Problem}, 404: {"model": Problem}},
)
async def unpublish_case_study(
    course_id: int,
    case_study_id: int,
    identity: Annotated[Identity, Depends(require_professor)],
    shards: Annotated[ShardManager, Depends(get_shards)],
) -> CaseStudyDetail:
    await ensure_course_owner(shards, course_id, identity)
    return await _set_status(shards, course_id, case_study_id, "draft")


@router.put(
    "/{case_study_id}/concepts",
    response_model=CaseStudyDetail,
    responses={
        400: {"model": Problem},
        403: {"model": Problem},
        404: {"model": Problem},
    },
)
async def set_case_study_concepts(
    course_id: int,
    case_study_id: int,
    body: MappingsIn,
    identity: Annotated[Identity, Depends(require_professor)],
    shards: Annotated[ShardManager, Depends(get_shards)],
) -> CaseStudyDetail:
    """Replace the whole set of concept mappings for a case study. Weights
    live in (0, 1] (mastery spec section 2); an unknown concept is a 400."""
    await ensure_course_owner(shards, course_id, identity)
    weights = {m.concept_id: m.weight for m in body.mappings}

    def apply(conn: sqlite3.Connection) -> None:
        exists = conn.execute(
            "SELECT 1 FROM case_studies WHERE id = ?", (case_study_id,)
        ).fetchone()
        if exists is None:
            raise HTTPException(status_code=404, detail="Case study not found.")
        known = {
            int(r[0])
            for r in conn.execute("SELECT id FROM concepts").fetchall()
        }
        missing = sorted(set(weights) - known)
        if missing:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown concept ids: {', '.join(map(str, missing))}.",
            )
        conn.execute(
            "DELETE FROM case_study_concepts WHERE case_study_id = ?",
            (case_study_id,),
        )
        conn.executemany(
            "INSERT INTO case_study_concepts (case_study_id, concept_id, weight)"
            " VALUES (?, ?, ?)",
            [(case_study_id, cid, w) for cid, w in weights.items()],
        )

    await shards.course(course_id).run(apply)
    return await _load_detail(shards, course_id, case_study_id, can_see_drafts=True)
