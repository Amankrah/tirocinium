"""Course CRUD (milestone 2.1). Courses live in directory.db (title, owner);
their case studies, concepts, and mappings live in the per-course shard.

Two authorization helpers serve every course-scoped surface: ensure_course_owner
gates the professor's authoring surfaces, and ensure_course_reader gates the
reading surfaces for both audiences (a professor sees drafts, a seat scoped to
the course sees published content only)."""

import sqlite3
import time
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field

from app.auth.deps import get_shards, require_professor
from app.auth.models import Identity, Role
from app.db.shards import ShardManager
from app.problems import Problem

router = APIRouter(prefix="/api/v1/courses", tags=["courses"])


class CourseIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)


class CourseUpdate(BaseModel):
    title: str = Field(min_length=1, max_length=200)


class CourseOut(BaseModel):
    id: int
    title: str
    created_at: int


class CourseListOut(BaseModel):
    courses: list[CourseOut]


async def ensure_course_owner(
    shards: ShardManager, course_id: int, identity: Identity
) -> str:
    """404 for a course that does not exist, 403 for one the caller does
    not own (admins pass). Returns the course title, which every caller so
    far wants anyway."""
    row = await shards.directory_reads.run(
        lambda conn: conn.execute(
            "SELECT title, owner_id FROM courses WHERE id = ?", (course_id,)
        ).fetchone()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Course not found.")
    title, owner_id = str(row[0]), row[1]
    if identity.role is not Role.ADMIN and owner_id != identity.user_id:
        raise HTTPException(
            status_code=403, detail="Only the course owner can do this."
        )
    return title


async def ensure_course_reader(
    shards: ShardManager, course_id: int, identity: Identity
) -> bool:
    """Gate a course's readable content. Professors and admins must own the
    course and may see drafts; a seat must be scoped to exactly this course
    and sees published content only. Returns True when the caller may see
    unpublished content."""
    if identity.role is Role.SEAT:
        if identity.course_id != course_id:
            raise HTTPException(status_code=403, detail="This is not your course.")
        return False
    await ensure_course_owner(shards, course_id, identity)
    return True


@router.get("", response_model=CourseListOut, responses={401: {"model": Problem}})
async def list_courses(
    identity: Annotated[Identity, Depends(require_professor)],
    shards: Annotated[ShardManager, Depends(get_shards)],
) -> CourseListOut:
    """The professor's own courses (admins see every course)."""
    if identity.role is Role.ADMIN:
        rows = await shards.directory_reads.run(
            lambda conn: conn.execute(
                "SELECT id, title, created_at FROM courses ORDER BY id"
            ).fetchall()
        )
    else:
        rows = await shards.directory_reads.run(
            lambda conn: conn.execute(
                "SELECT id, title, created_at FROM courses WHERE owner_id = ?"
                " ORDER BY id",
                (identity.user_id,),
            ).fetchall()
        )
    return CourseListOut(
        courses=[CourseOut(id=int(r[0]), title=str(r[1]), created_at=int(r[2])) for r in rows]
    )


@router.post(
    "",
    status_code=201,
    response_model=CourseOut,
    responses={401: {"model": Problem}, 403: {"model": Problem}},
)
async def create_course(
    body: CourseIn,
    identity: Annotated[Identity, Depends(require_professor)],
    shards: Annotated[ShardManager, Depends(get_shards)],
) -> CourseOut:
    now = int(time.time())
    course_id = await shards.directory.run(
        lambda conn: conn.execute(
            "INSERT INTO courses (title, created_at, owner_id) VALUES (?, ?, ?)",
            (body.title, now, identity.user_id),
        ).lastrowid
    )
    assert course_id is not None
    return CourseOut(id=course_id, title=body.title, created_at=now)


@router.get(
    "/{course_id}",
    response_model=CourseOut,
    responses={403: {"model": Problem}, 404: {"model": Problem}},
)
async def get_course(
    course_id: int,
    identity: Annotated[Identity, Depends(require_professor)],
    shards: Annotated[ShardManager, Depends(get_shards)],
) -> CourseOut:
    await ensure_course_owner(shards, course_id, identity)
    row = await shards.directory_reads.run(
        lambda conn: conn.execute(
            "SELECT id, title, created_at FROM courses WHERE id = ?", (course_id,)
        ).fetchone()
    )
    assert row is not None  # ensure_course_owner already proved existence
    return CourseOut(id=int(row[0]), title=str(row[1]), created_at=int(row[2]))


@router.patch(
    "/{course_id}",
    response_model=CourseOut,
    responses={403: {"model": Problem}, 404: {"model": Problem}},
)
async def update_course(
    course_id: int,
    body: CourseUpdate,
    identity: Annotated[Identity, Depends(require_professor)],
    shards: Annotated[ShardManager, Depends(get_shards)],
) -> CourseOut:
    await ensure_course_owner(shards, course_id, identity)
    created_at = await shards.directory.run(
        lambda conn: _rename_course(conn, course_id, body.title)
    )
    return CourseOut(id=course_id, title=body.title, created_at=created_at)


def _rename_course(conn: sqlite3.Connection, course_id: int, title: str) -> int:
    conn.execute("UPDATE courses SET title = ? WHERE id = ?", (title, course_id))
    return int(
        conn.execute(
            "SELECT created_at FROM courses WHERE id = ?", (course_id,)
        ).fetchone()[0]
    )


@router.delete(
    "/{course_id}",
    status_code=204,
    responses={
        403: {"model": Problem},
        404: {"model": Problem},
        409: {"model": Problem},
    },
)
async def delete_course(
    course_id: int,
    identity: Annotated[Identity, Depends(require_professor)],
    shards: Annotated[ShardManager, Depends(get_shards)],
) -> Response:
    """Delete a course and drop its shard file. Refused while seats exist:
    seats carry student submission history, and deleting the course out from
    under them would destroy it silently (decision 0013)."""
    await ensure_course_owner(shards, course_id, identity)
    seats = await shards.directory_reads.run(
        lambda conn: conn.execute(
            "SELECT COUNT(*) FROM seats WHERE course_id = ?", (course_id,)
        ).fetchone()[0]
    )
    if seats:
        raise HTTPException(
            status_code=409,
            detail="Revoke and remove this course's seats before deleting it.",
        )
    await shards.directory.run(
        lambda conn: conn.execute("DELETE FROM courses WHERE id = ?", (course_id,))
    )
    shards.drop_course(course_id)
    return Response(status_code=204)
