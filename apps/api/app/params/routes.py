"""The parameter spec editor panel backend (milestone 5.1): read, save, and
clear a case study's parameter spec. Saving runs the figure-frozen check: a
parameter whose base value is visibly printed inside an essential figure is
blocked with the stated reason (409, one entry per conflict), because a
variant's figures are the professor's pixels and cannot follow the text.

The spec lives compressed in case_studies.param_spec_z (guide 3.4); plaintext
only in transit. PUT is naturally idempotent, so no idempotency ledger.
"""

import sqlite3
import time
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import Field

from app.auth.deps import get_shards, require_professor
from app.auth.models import Identity
from app.compression import compress_text, decompress_text
from app.courses.routes import ensure_course_owner
from app.db.shards import ShardManager
from app.params.figure_check import (
    BlockedParameter,
    check_spec_against_figures,
    load_essential_figures,
    reading_for,
)
from app.params.model import FigureReader, get_figure_reader
from app.params.schema import ParamSpec
from app.problems import Problem
from app.storage import ObjectStorage, get_object_storage

router = APIRouter(
    prefix="/api/v1/courses/{course_id}/case-studies/{case_study_id}/param-spec",
    tags=["parameterization"],
)


class ParamSpecBlockedProblem(Problem):
    """The 409 the frozen check returns: RFC 7807 with a `blocked` extension
    listing each refused parameter and its professor-facing reason."""

    blocked: list[BlockedParameter] = Field(default_factory=list)


async def _ensure_case_study(
    shards: ShardManager, course_id: int, case_study_id: int
) -> None:
    def read(conn: sqlite3.Connection) -> bool:
        return (
            conn.execute(
                "SELECT 1 FROM case_studies WHERE id = ?", (case_study_id,)
            ).fetchone()
            is not None
        )

    if not await shards.course_reads(course_id).run(read):
        raise HTTPException(status_code=404, detail="Case study not found.")


@router.get(
    "",
    response_model=ParamSpec,
    responses={403: {"model": Problem}, 404: {"model": Problem}},
)
async def get_param_spec(
    course_id: int,
    case_study_id: int,
    identity: Annotated[Identity, Depends(require_professor)],
    shards: Annotated[ShardManager, Depends(get_shards)],
) -> ParamSpec:
    await ensure_course_owner(shards, course_id, identity)

    def read(conn: sqlite3.Connection) -> ParamSpec | None:
        row = conn.execute(
            "SELECT param_spec_z FROM case_studies WHERE id = ?", (case_study_id,)
        ).fetchone()
        if row is None or row[0] is None:
            return None
        return ParamSpec.model_validate_json(
            decompress_text(conn, "problem_text", bytes(row[0]))
        )

    spec = await shards.course_reads(course_id).run(read)
    if spec is None:
        raise HTTPException(
            status_code=404, detail="This case study has no parameter spec."
        )
    return spec


@router.put(
    "",
    response_model=ParamSpec,
    responses={
        403: {"model": Problem},
        404: {"model": Problem},
        409: {"model": ParamSpecBlockedProblem},
    },
)
async def put_param_spec(
    course_id: int,
    case_study_id: int,
    spec: ParamSpec,
    identity: Annotated[Identity, Depends(require_professor)],
    shards: Annotated[ShardManager, Depends(get_shards)],
    storage: Annotated[ObjectStorage, Depends(get_object_storage)],
    reader: Annotated[FigureReader, Depends(get_figure_reader)],
) -> ParamSpec:
    await ensure_course_owner(shards, course_id, identity)
    await _ensure_case_study(shards, course_id, case_study_id)

    figures = await shards.course_reads(course_id).run(
        load_essential_figures(case_study_id)
    )
    readings = [
        (
            figure,
            await reading_for(
                shards=shards,
                storage=storage,
                reader=reader,
                course_id=course_id,
                figure=figure,
            ),
        )
        for figure in figures
    ]
    blocked = check_spec_against_figures(spec, readings)
    if blocked:
        raise HTTPException(
            status_code=409,
            detail={
                "detail": "Some parameter values appear inside a figure.",
                "blocked": [b.model_dump() for b in blocked],
            },
        )

    now = int(time.time())
    payload = spec.model_dump_json()

    def store(conn: sqlite3.Connection) -> None:
        conn.execute(
            "UPDATE case_studies SET param_spec_z = ?, updated_at = ?"
            " WHERE id = ?",
            (compress_text(conn, "problem_text", payload), now, case_study_id),
        )

    await shards.course(course_id).run(store)
    return spec


@router.delete(
    "",
    status_code=204,
    responses={403: {"model": Problem}, 404: {"model": Problem}},
)
async def delete_param_spec(
    course_id: int,
    case_study_id: int,
    identity: Annotated[Identity, Depends(require_professor)],
    shards: Annotated[ShardManager, Depends(get_shards)],
) -> Response:
    await ensure_course_owner(shards, course_id, identity)
    await _ensure_case_study(shards, course_id, case_study_id)
    now = int(time.time())

    def clear(conn: sqlite3.Connection) -> None:
        conn.execute(
            "UPDATE case_studies SET param_spec_z = NULL, updated_at = ?"
            " WHERE id = ?",
            (now, case_study_id),
        )

    await shards.course(course_id).run(clear)
    return Response(status_code=204)
