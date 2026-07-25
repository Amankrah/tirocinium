"""The variant surface (milestone 5.3): request generation, read the states,
and the professor's review-queue verbs. Generation runs in the worker; this
surface only enqueues seeds and reads results. A flagged variant is never
served to a student anywhere; the professor's promote is the explicit act
that overrides a flag ('manual'), the same propose-and-dispose shape as
everything else the AI produces.

Seeds are the idempotency: with an Idempotency-Key, the request's seeds are
derived deterministically from it, so a retry enqueues the same seeds and the
(case study, seed) unique index plus the broker's job id collapse the
duplicates. Without a key, seeds are random.
"""

import hashlib
import json
import secrets
import sqlite3
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Response
from pydantic import BaseModel, Field

from app.auth.deps import get_shards, require_professor
from app.auth.models import Identity
from app.compression import compress_text, decompress_text
from app.courses.routes import ensure_course_owner
from app.db.shards import ShardManager
from app.problems import Problem
from app.tasks import TaskQueue, get_task_queue

router = APIRouter(
    prefix="/api/v1/courses/{course_id}", tags=["variants"]
)

DEFAULT_LIMIT = 50
MAX_LIMIT = 100
MAX_BATCH = 20
_SEED_BITS = 62

VERIFICATION_STATES = ("verified", "flagged", "manual")


class GenerateIn(BaseModel):
    count: int = Field(default=1, ge=1, le=MAX_BATCH)


class GenerateOut(BaseModel):
    enqueued: int
    seeds: list[int]


class VariantSummary(BaseModel):
    id: int
    seed: int | None
    verification: str
    flag_reason: str | None
    model_id: str
    created_at: int


class VariantListOut(BaseModel):
    items: list[VariantSummary]
    next_cursor: int | None


class VariantDetail(VariantSummary):
    """The review read: the variant, both solutions (the flagged diff view
    needs the generation solution and the independent re-solve side by side),
    the sampled values, and full provenance."""

    body: str
    solution: str
    final_answers: list[str]
    verify_solution: str | None
    values: dict[str, float | int | str | None]
    verify_model_id: str | None
    generation_prompt_version: str | None
    verification_prompt_version: str | None


class VariantEdit(BaseModel):
    body: str | None = Field(default=None, min_length=1)
    solution: str | None = Field(default=None, min_length=1)


def _derived_seeds(key: str, count: int) -> list[int]:
    return [
        int.from_bytes(
            hashlib.sha256(f"{key}:{index}".encode()).digest()[:8], "big"
        )
        >> (64 - _SEED_BITS)
        for index in range(count)
    ]


@router.post(
    "/case-studies/{case_study_id}/variants",
    status_code=202,
    response_model=GenerateOut,
    responses={
        403: {"model": Problem},
        404: {"model": Problem},
        409: {"model": Problem},
    },
)
async def request_variants(
    course_id: int,
    case_study_id: int,
    body: GenerateIn,
    identity: Annotated[Identity, Depends(require_professor)],
    shards: Annotated[ShardManager, Depends(get_shards)],
    queue: Annotated[TaskQueue, Depends(get_task_queue)],
    idempotency_key: Annotated[str | None, Header()] = None,
) -> GenerateOut:
    """Enqueue generation of `count` variants. 409 without a parameter spec:
    generation samples the spec, so there is nothing to generate from."""
    await ensure_course_owner(shards, course_id, identity)

    def check(conn: sqlite3.Connection) -> str | None:
        row = conn.execute(
            "SELECT param_spec_z FROM case_studies WHERE id = ?",
            (case_study_id,),
        ).fetchone()
        if row is None:
            return "missing"
        if row[0] is None:
            return "no_spec"
        return None

    problem = await shards.course_reads(course_id).run(check)
    if problem == "missing":
        raise HTTPException(status_code=404, detail="Case study not found.")
    if problem == "no_spec":
        raise HTTPException(
            status_code=409,
            detail="This case study has no parameter spec, so variants can't be generated.",
        )

    seeds = (
        _derived_seeds(idempotency_key, body.count)
        if idempotency_key is not None
        else [secrets.randbits(_SEED_BITS) for _ in range(body.count)]
    )
    for seed in seeds:
        await queue.enqueue_generate_variant(course_id, case_study_id, seed)
    return GenerateOut(enqueued=len(seeds), seeds=seeds)


@router.get(
    "/case-studies/{case_study_id}/variants",
    response_model=VariantListOut,
    responses={403: {"model": Problem}, 404: {"model": Problem}},
)
async def list_variants(
    course_id: int,
    case_study_id: int,
    identity: Annotated[Identity, Depends(require_professor)],
    shards: Annotated[ShardManager, Depends(get_shards)],
    state: str | None = None,
    cursor: int | None = None,
    limit: int = DEFAULT_LIMIT,
) -> VariantListOut:
    """The professor's view of a case study's variants, optionally filtered
    by verification state (the review queue is ?state=flagged). Students never
    read this surface; the practice loop serves from the pool (5.4)."""
    await ensure_course_owner(shards, course_id, identity)
    if state is not None and state not in VERIFICATION_STATES:
        raise HTTPException(
            status_code=400,
            detail="state must be one of: verified, flagged, manual.",
        )
    limit = max(1, min(int(limit), MAX_LIMIT))
    after = cursor if cursor is not None else 0
    state_filter = "" if state is None else " AND verification = ?"

    def read(conn: sqlite3.Connection) -> tuple[list[VariantSummary], int | None]:
        exists = conn.execute(
            "SELECT 1 FROM case_studies WHERE id = ?", (case_study_id,)
        ).fetchone()
        if exists is None:
            raise HTTPException(status_code=404, detail="Case study not found.")
        parameters: list[object] = [case_study_id, after]
        if state is not None:
            parameters.append(state)
        parameters.append(limit + 1)
        rows = conn.execute(
            "SELECT id, seed, verification, flag_reason, model_id, created_at"
            " FROM variants"
            f" WHERE case_study_id = ? AND id > ?{state_filter}"
            " ORDER BY id LIMIT ?",
            parameters,
        ).fetchall()
        page = rows[:limit]
        items = [
            VariantSummary(
                id=int(r[0]),
                seed=None if r[1] is None else int(r[1]),
                verification=str(r[2]),
                flag_reason=None if r[3] is None else str(r[3]),
                model_id=str(r[4]),
                created_at=int(r[5]),
            )
            for r in page
        ]
        next_cursor = int(page[-1][0]) if len(rows) > limit else None
        return items, next_cursor

    items, next_cursor = await shards.course_reads(course_id).run(read)
    return VariantListOut(items=items, next_cursor=next_cursor)


@router.get(
    "/variants/{variant_id}",
    response_model=VariantDetail,
    responses={403: {"model": Problem}, 404: {"model": Problem}},
)
async def get_variant(
    course_id: int,
    variant_id: int,
    identity: Annotated[Identity, Depends(require_professor)],
    shards: Annotated[ShardManager, Depends(get_shards)],
) -> VariantDetail:
    await ensure_course_owner(shards, course_id, identity)

    def read(conn: sqlite3.Connection) -> VariantDetail:
        row = conn.execute(
            "SELECT id, seed, verification, flag_reason, model_id, created_at,"
            " body_z, solution_z, verify_solution_z, seed_json_z,"
            " verify_model_id, generation_prompt_version,"
            " verification_prompt_version"
            " FROM variants WHERE id = ?",
            (variant_id,),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Variant not found.")
        solution_blob = json.loads(
            decompress_text(conn, "problem_text", bytes(row[7]))
        )
        return VariantDetail(
            id=int(row[0]),
            seed=None if row[1] is None else int(row[1]),
            verification=str(row[2]),
            flag_reason=None if row[3] is None else str(row[3]),
            model_id=str(row[4]),
            created_at=int(row[5]),
            body=decompress_text(conn, "problem_text", bytes(row[6])),
            solution=str(solution_blob.get("solution_md", "")),
            final_answers=[
                str(answer)
                for answer in solution_blob.get("final_answers", [])
            ],
            verify_solution=(
                None
                if row[8] is None
                else decompress_text(conn, "problem_text", bytes(row[8]))
            ),
            values=json.loads(
                decompress_text(conn, "problem_text", bytes(row[9]))
            ),
            verify_model_id=None if row[10] is None else str(row[10]),
            generation_prompt_version=None if row[11] is None else str(row[11]),
            verification_prompt_version=None if row[12] is None else str(row[12]),
        )

    return await shards.course_reads(course_id).run(read)


@router.post(
    "/variants/{variant_id}/promote",
    response_model=VariantSummary,
    responses={
        403: {"model": Problem},
        404: {"model": Problem},
        409: {"model": Problem},
    },
)
async def promote_variant(
    course_id: int,
    variant_id: int,
    identity: Annotated[Identity, Depends(require_professor)],
    shards: Annotated[ShardManager, Depends(get_shards)],
) -> VariantSummary:
    """The professor overrides a flag after review: flagged becomes 'manual'
    (the professor vouches for it; it serves like verified). Only a flagged
    variant promotes; anything else is already disposed."""
    await ensure_course_owner(shards, course_id, identity)

    def promote(conn: sqlite3.Connection) -> None:
        row = conn.execute(
            "SELECT verification FROM variants WHERE id = ?", (variant_id,)
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Variant not found.")
        if str(row[0]) != "flagged":
            raise HTTPException(
                status_code=409, detail="Only a flagged variant can be promoted."
            )
        conn.execute(
            "UPDATE variants SET verification = 'manual', flag_reason = NULL"
            " WHERE id = ?",
            (variant_id,),
        )

    await shards.course(course_id).run(promote)
    return await _summary(shards, course_id, variant_id)


@router.patch(
    "/variants/{variant_id}",
    response_model=VariantSummary,
    responses={403: {"model": Problem}, 404: {"model": Problem}},
)
async def edit_variant(
    course_id: int,
    variant_id: int,
    body: VariantEdit,
    identity: Annotated[Identity, Depends(require_professor)],
    shards: Annotated[ShardManager, Depends(get_shards)],
) -> VariantSummary:
    """The professor edits a variant's body or solution. An edited variant is
    'manual': the professor took responsibility for its correctness, whatever
    the models said before."""
    await ensure_course_owner(shards, course_id, identity)

    def edit(conn: sqlite3.Connection) -> None:
        row = conn.execute(
            "SELECT solution_z FROM variants WHERE id = ?", (variant_id,)
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Variant not found.")
        sets = ["verification = 'manual'", "flag_reason = NULL"]
        values: list[object] = []
        if body.body is not None:
            sets.append("body_z = ?")
            values.append(compress_text(conn, "problem_text", body.body))
        if body.solution is not None:
            stored = json.loads(
                decompress_text(conn, "problem_text", bytes(row[0]))
            )
            stored["solution_md"] = body.solution
            sets.append("solution_z = ?")
            values.append(
                compress_text(conn, "problem_text", json.dumps(stored, sort_keys=True))
            )
        values.append(variant_id)
        conn.execute(
            f"UPDATE variants SET {', '.join(sets)} WHERE id = ?", values
        )

    await shards.course(course_id).run(edit)
    return await _summary(shards, course_id, variant_id)


@router.delete(
    "/variants/{variant_id}",
    status_code=204,
    responses={
        403: {"model": Problem},
        404: {"model": Problem},
        409: {"model": Problem},
    },
)
async def discard_variant(
    course_id: int,
    variant_id: int,
    identity: Annotated[Identity, Depends(require_professor)],
    shards: Annotated[ShardManager, Depends(get_shards)],
) -> Response:
    await ensure_course_owner(shards, course_id, identity)

    def discard(conn: sqlite3.Connection) -> None:
        exists = conn.execute(
            "SELECT 1 FROM variants WHERE id = ?", (variant_id,)
        ).fetchone()
        if exists is None:
            raise HTTPException(status_code=404, detail="Variant not found.")
        try:
            conn.execute("DELETE FROM variants WHERE id = ?", (variant_id,))
        except sqlite3.IntegrityError as exc:
            raise HTTPException(
                status_code=409,
                detail="This variant has submissions; it can't be discarded.",
            ) from exc

    await shards.course(course_id).run(discard)
    return Response(status_code=204)


async def _summary(
    shards: ShardManager, course_id: int, variant_id: int
) -> VariantSummary:
    def read(conn: sqlite3.Connection) -> VariantSummary:
        row = conn.execute(
            "SELECT id, seed, verification, flag_reason, model_id, created_at"
            " FROM variants WHERE id = ?",
            (variant_id,),
        ).fetchone()
        assert row is not None
        return VariantSummary(
            id=int(row[0]),
            seed=None if row[1] is None else int(row[1]),
            verification=str(row[2]),
            flag_reason=None if row[3] is None else str(row[3]),
            model_id=str(row[4]),
            created_at=int(row[5]),
        )

    return await shards.course_reads(course_id).run(read)
