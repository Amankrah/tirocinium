"""Minimal course surface for 1.5: create a course, own its seats. Phase
2.1 extends this into the full CRUD with publish states."""

import time
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.auth.deps import get_shards, require_professor
from app.auth.models import Identity, Role
from app.db.shards import ShardManager
from app.problems import Problem

router = APIRouter(prefix="/api/v1/courses", tags=["courses"])


class CourseIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)


class CourseOut(BaseModel):
    id: int
    title: str


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
    return CourseOut(id=course_id, title=body.title)
