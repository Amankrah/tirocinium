"""Concept CRUD (mastery spec section 2). Concepts are a course's flat,
professor-owned vocabulary, stored in the per-course shard. The professor
authors them (assisted by AI proposals in later phases, under propose-and-
dispose); a seat scoped to the course may read them, since course home shows
concept tags."""

import sqlite3
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field

from app.auth.deps import current_identity, get_shards, require_professor
from app.auth.models import Identity
from app.courses.routes import ensure_course_owner, ensure_course_reader
from app.db.shards import ShardManager
from app.problems import Problem

router = APIRouter(prefix="/api/v1/courses/{course_id}/concepts", tags=["concepts"])


class ConceptIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    position: int | None = Field(default=None, ge=0)


class ConceptUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    position: int | None = Field(default=None, ge=0)


class ConceptOut(BaseModel):
    id: int
    name: str
    description: str | None
    position: int


class ConceptListOut(BaseModel):
    concepts: list[ConceptOut]


def _row_to_concept(row: tuple[Any, ...]) -> ConceptOut:
    return ConceptOut(
        id=int(row[0]),
        name=str(row[1]),
        description=None if row[2] is None else str(row[2]),
        position=int(row[3]),
    )


async def _load_concept(
    shards: ShardManager, course_id: int, concept_id: int
) -> ConceptOut:
    row = await shards.course_reads(course_id).run(
        lambda conn: conn.execute(
            "SELECT id, name, description, position FROM concepts WHERE id = ?",
            (concept_id,),
        ).fetchone()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Concept not found.")
    return _row_to_concept(row)


@router.get(
    "",
    response_model=ConceptListOut,
    responses={403: {"model": Problem}, 404: {"model": Problem}},
)
async def list_concepts(
    course_id: int,
    identity: Annotated[Identity, Depends(current_identity)],
    shards: Annotated[ShardManager, Depends(get_shards)],
) -> ConceptListOut:
    await ensure_course_reader(shards, course_id, identity)
    rows = await shards.course_reads(course_id).run(
        lambda conn: conn.execute(
            "SELECT id, name, description, position FROM concepts"
            " ORDER BY position, id"
        ).fetchall()
    )
    return ConceptListOut(concepts=[_row_to_concept(r) for r in rows])


@router.post(
    "",
    status_code=201,
    response_model=ConceptOut,
    responses={403: {"model": Problem}, 404: {"model": Problem}},
)
async def create_concept(
    course_id: int,
    body: ConceptIn,
    identity: Annotated[Identity, Depends(require_professor)],
    shards: Annotated[ShardManager, Depends(get_shards)],
) -> ConceptOut:
    await ensure_course_owner(shards, course_id, identity)

    def insert(conn: sqlite3.Connection) -> int:
        position = body.position
        if position is None:
            row = conn.execute("SELECT MAX(position) FROM concepts").fetchone()
            position = 0 if row[0] is None else int(row[0]) + 1
        cursor = conn.execute(
            "INSERT INTO concepts (name, description, position) VALUES (?, ?, ?)",
            (body.name, body.description, position),
        )
        assert cursor.lastrowid is not None
        return cursor.lastrowid

    concept_id = await shards.course(course_id).run(insert)
    return await _load_concept(shards, course_id, concept_id)


@router.patch(
    "/{concept_id}",
    response_model=ConceptOut,
    responses={403: {"model": Problem}, 404: {"model": Problem}},
)
async def update_concept(
    course_id: int,
    concept_id: int,
    body: ConceptUpdate,
    identity: Annotated[Identity, Depends(require_professor)],
    shards: Annotated[ShardManager, Depends(get_shards)],
) -> ConceptOut:
    await ensure_course_owner(shards, course_id, identity)
    await _load_concept(shards, course_id, concept_id)  # 404 before writing

    fields = body.model_dump(exclude_unset=True)
    if fields:
        assignments = ", ".join(f"{name} = ?" for name in fields)
        values = [*fields.values(), concept_id]
        await shards.course(course_id).run(
            lambda conn: conn.execute(
                f"UPDATE concepts SET {assignments} WHERE id = ?", values
            )
        )
    return await _load_concept(shards, course_id, concept_id)


@router.delete(
    "/{concept_id}",
    status_code=204,
    responses={403: {"model": Problem}, 404: {"model": Problem}},
)
async def delete_concept(
    course_id: int,
    concept_id: int,
    identity: Annotated[Identity, Depends(require_professor)],
    shards: Annotated[ShardManager, Depends(get_shards)],
) -> Response:
    await ensure_course_owner(shards, course_id, identity)
    await _load_concept(shards, course_id, concept_id)  # 404 before writing

    def delete(conn: sqlite3.Connection) -> None:
        conn.execute(
            "DELETE FROM case_study_concepts WHERE concept_id = ?", (concept_id,)
        )
        conn.execute("DELETE FROM concepts WHERE id = ?", (concept_id,))

    await shards.course(course_id).run(delete)
    return Response(status_code=204)
