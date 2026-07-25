"""The parameterization surface (milestones 5.1 and 5.2): the parameter spec
editor panel backend, and the auto-parameterize proposal call.

Saving a spec runs the figure-frozen check: a parameter whose base value is
visibly printed inside an essential figure is blocked with the stated reason
(409, one entry per conflict), because a variant's figures are the professor's
pixels and cannot follow the text. The proposal call drafts a complete spec
from the confirmed question and solution, applies the same check to its own
output before the professor ever sees it, and is always a draft: the explicit
save through the PUT is the professor disposing, and how much of the proposal
survives that save is logged as the prompt-quality signal (guide 6.2).

The spec lives compressed in case_studies.param_spec_z (guide 3.4); plaintext
only in transit. PUT is naturally idempotent; the proposal POST takes an
Idempotency-Key so a retry replays the stored proposal, never a second call.
"""

import sqlite3
import time
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Response
from pydantic import Field

from app.auth.deps import get_shards, require_professor
from app.auth.models import Identity
from app.compression import compress_text, decompress_text
from app.courses.routes import ensure_course_owner
from app.db.shards import ShardManager
from app.params.figure_check import (
    BlockedParameter,
    EssentialFigure,
    check_spec_against_figures,
    load_essential_figures,
    reading_for,
)
from app.params.model import FigureReader, FigureReading, get_figure_reader
from app.params.proposal import (
    DEFAULT_PROPOSAL_MODEL,
    ParameterAnnotation,
    ProposalPayload,
    ProposalProvenance,
    SpecProposer,
    find_positions,
    get_spec_proposer,
    proposal_document,
    spec_edit_counts,
)
from app.params.schema import ParamSpec
from app.problems import Problem
from app.prompts import load_prompt
from app.storage import ObjectStorage, get_object_storage

router = APIRouter(
    prefix="/api/v1/courses/{course_id}/case-studies/{case_study_id}",
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
    "/param-spec",
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
    "/param-spec",
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
        _log_proposal_edits(conn, case_study_id, spec, now)

    await shards.course(course_id).run(store)
    return spec


def _log_proposal_edits(
    conn: sqlite3.Connection, case_study_id: int, saved: ParamSpec, now: int
) -> None:
    """The prompt-quality signal (guide 6.2): when this save follows an
    auto-parameterize proposal, record how much of that proposal survived the
    professor's editing. Only the latest unsaved proposal is scored, once."""
    row = conn.execute(
        "SELECT id, payload_z FROM spec_proposals"
        " WHERE case_study_id = ? AND saved_at IS NULL"
        " ORDER BY id DESC LIMIT 1",
        (case_study_id,),
    ).fetchone()
    if row is None:
        return
    proposal = ProposalPayload.model_validate_json(
        decompress_text(conn, "problem_text", bytes(row[1]))
    )
    counts = spec_edit_counts(proposal.spec, saved)
    conn.execute(
        "UPDATE spec_proposals SET saved_at = ?, parameters_kept = ?,"
        " parameters_changed = ?, parameters_dropped = ?, parameters_added = ?,"
        " invariants_edit_distance = ? WHERE id = ?",
        (
            now,
            counts.kept,
            counts.changed,
            counts.dropped,
            counts.added,
            counts.invariants_edit_distance,
            int(row[0]),
        ),
    )


class ProposalOut(ProposalPayload, frozen=True):
    """The proposal response: the stored payload plus its row id, so a retry
    can be recognised and the edit signal can point back at it."""

    proposal_id: int


@router.post(
    "/auto-parameterize",
    response_model=ProposalOut,
    responses={403: {"model": Problem}, 404: {"model": Problem}},
)
async def auto_parameterize(
    course_id: int,
    case_study_id: int,
    identity: Annotated[Identity, Depends(require_professor)],
    shards: Annotated[ShardManager, Depends(get_shards)],
    storage: Annotated[ObjectStorage, Depends(get_object_storage)],
    reader: Annotated[FigureReader, Depends(get_figure_reader)],
    proposer: Annotated[SpecProposer, Depends(get_spec_proposer)],
    idempotency_key: Annotated[str | None, Header()] = None,
) -> ProposalOut:
    """Draft a complete parameter spec from the confirmed question and
    solution (guide 6.2). The proposal is a draft only: it is returned, never
    stored as the spec, and the professor saves through the param-spec PUT.
    Frozen values are excluded before the professor ever sees them."""
    await ensure_course_owner(shards, course_id, identity)

    def load_content(conn: sqlite3.Connection) -> tuple[str, str | None] | None:
        row = conn.execute(
            "SELECT body_z FROM case_studies WHERE id = ?", (case_study_id,)
        ).fetchone()
        if row is None:
            return None
        body = decompress_text(conn, "problem_text", bytes(row[0]))
        # The confirmed item this case study was born from holds the solution;
        # a hand-authored case study has none. Confirmed content only: staged
        # items never feed a proposal.
        item = conn.execute(
            "SELECT solution_z FROM import_items"
            " WHERE case_study_id = ? AND state = 'confirmed'"
            " ORDER BY id DESC LIMIT 1",
            (case_study_id,),
        ).fetchone()
        solution = (
            None
            if item is None or item[0] is None
            else decompress_text(conn, "problem_text", bytes(item[0]))
        )
        return body, solution

    content = await shards.course_reads(course_id).run(load_content)
    if content is None:
        raise HTTPException(status_code=404, detail="Case study not found.")
    body, solution = content

    if idempotency_key is not None:

        def load_replay(conn: sqlite3.Connection) -> tuple[int, str] | None:
            row = conn.execute(
                "SELECT id, payload_z FROM spec_proposals WHERE idempotency_key = ?",
                (idempotency_key,),
            ).fetchone()
            if row is None:
                return None
            return int(row[0]), decompress_text(
                conn, "problem_text", bytes(row[1])
            )

        replay = await shards.course_reads(course_id).run(load_replay)
        if replay is not None:
            replay_id, payload_json = replay
            return ProposalOut(
                proposal_id=replay_id,
                **ProposalPayload.model_validate_json(payload_json).model_dump(),
            )

    figures = await shards.course_reads(course_id).run(
        load_essential_figures(case_study_id)
    )
    readings: list[tuple[EssentialFigure, FigureReading]] = [
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
    frozen_values: list[str] = []
    for _, reading in readings:
        for value in reading.values:
            if value not in frozen_values:
                frozen_values.append(value)

    prompt = load_prompt("auto-parameterize", "v1")
    document = proposal_document(body, solution, frozen_values)
    proposal = await proposer.propose(
        document, prompt.text, model_id=DEFAULT_PROPOSAL_MODEL
    )

    # The same frozen check, applied to the proposal before the professor
    # sees it: conflicting parameters come back locked with the reason, not
    # silently and not as part of the draft.
    blocked = check_spec_against_figures(proposal.to_spec(), readings)
    excluded = {b.parameter for b in blocked}
    spec = proposal.to_spec(exclude=excluded)
    payload = ProposalPayload(
        spec=spec,
        annotations={
            name: ParameterAnnotation(
                rationale=parameter.rationale,
                literal=parameter.literal,
                positions=find_positions(body, parameter.literal),
            )
            for name, parameter in proposal.parameters.items()
            if name not in excluded
        },
        invariant_rationales=[
            invariant.rationale for invariant in proposal.invariants
        ],
        frozen=blocked,
        provenance=ProposalProvenance(
            model_id=DEFAULT_PROPOSAL_MODEL, prompt_version=prompt.provenance
        ),
    )

    now = int(time.time())
    payload_json = payload.model_dump_json()

    def store(conn: sqlite3.Connection) -> int:
        cursor = conn.execute(
            "INSERT INTO spec_proposals"
            " (case_study_id, payload_z, model_id, prompt_version,"
            "  idempotency_key, created_at)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            (
                case_study_id,
                compress_text(conn, "problem_text", payload_json),
                DEFAULT_PROPOSAL_MODEL,
                prompt.provenance,
                idempotency_key,
                now,
            ),
        )
        assert cursor.lastrowid is not None
        return cursor.lastrowid

    proposal_id = await shards.course(course_id).run(store)
    return ProposalOut(proposal_id=proposal_id, **payload.model_dump())


@router.delete(
    "/param-spec",
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
