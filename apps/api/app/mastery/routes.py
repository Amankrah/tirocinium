"""The mastery surface (milestone 6.2 and the backend of 6.4): the student's
mastery picture with its evidence trails (never a bare label, spec section
9), the revisit queue with one targeted variant per concept (spec section 5),
the professor's per-concept distribution (spec section 6, no per-seat
ranking), and the grading action that supersedes automatic evidence.

All writes run through the mastery store inside the shard writer's
transaction; reads assemble views through the same store so every number
comes from the Rust core.
"""

import json
import sqlite3
import time
from collections import Counter
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.auth.deps import current_identity, get_shards, require_professor
from app.auth.models import Identity, Role
from app.courses.routes import ensure_course_owner, ensure_course_reader
from app.db.shards import ShardManager
from app.mastery.params import active_params_json
from app.problems import Problem
from mastery_store import MasteryStore

router = APIRouter(prefix="/api/v1/courses/{course_id}", tags=["mastery"])

TRAIL_LIMIT = 5
ATTEMPT_EXCLUSION_SECONDS = 48 * 3600
SERVABLE = ("verified", "manual")


class TrailLine(BaseModel):
    at: int
    text: str


class ConceptMastery(BaseModel):
    """One concept in the student's picture. The trail ships with the state
    (spec section 9): the frontend never renders a bare label."""

    concept_id: int
    name: str
    description: str | None
    label: str
    m_eff: float
    retention: float
    due_for_revisit: bool
    trail: list[TrailLine]


class MasteryOut(BaseModel):
    concepts: list[ConceptMastery]


class RevisitVariant(BaseModel):
    variant_id: int
    case_study_id: int
    case_study_title: str


class RevisitConcept(BaseModel):
    """One revisit suggestion: the concept and one targeted variant, or none
    when no unattempted verified variant exists right now (the queue stays
    calm either way)."""

    concept_id: int
    name: str
    variant: RevisitVariant | None


class RevisitOut(BaseModel):
    concepts: list[RevisitConcept]


class ConceptDistribution(BaseModel):
    """The professor's lens: how the class stands on one concept. Gaps fill
    in when the defense conversations of Phase 7 start naming them."""

    concept_id: int
    name: str
    unseen: int
    shaky: int
    developing: int
    solid: int
    gaps: list[str] = Field(default_factory=list)


class DistributionOut(BaseModel):
    concepts: list[ConceptDistribution]


class GradeIn(BaseModel):
    """The professor's grade for a submission, already mapped to the spec's
    [0,1] scale."""

    score: float = Field(ge=0.0, le=1.0)


class GradeOut(BaseModel):
    submission_id: int
    score: float
    graded_at: int


def _require_seat(identity: Identity, course_id: int) -> int:
    """The student surfaces are seat-only: a seat sees its own picture and
    nothing else, and a professor reads the class through the distribution."""
    if identity.role != Role.SEAT or identity.course_id != course_id:
        raise HTTPException(
            status_code=403, detail="This view belongs to a seat in the course."
        )
    assert identity.seat_id is not None
    return identity.seat_id


@router.get(
    "/mastery",
    response_model=MasteryOut,
    responses={403: {"model": Problem}, 404: {"model": Problem}},
)
async def seat_mastery(
    course_id: int,
    identity: Annotated[Identity, Depends(current_identity)],
    shards: Annotated[ShardManager, Depends(get_shards)],
) -> MasteryOut:
    await ensure_course_reader(shards, course_id, identity)
    seat_id = _require_seat(identity, course_id)
    params = await active_params_json(shards)
    now = int(time.time())

    def read(conn: sqlite3.Connection) -> list[ConceptMastery]:
        store = MasteryStore(conn, params_json=params)
        views = {v.concept_id: v for v in store.seat_view(seat_id, now)}
        concepts = conn.execute(
            "SELECT id, name, description FROM concepts ORDER BY position, id"
        ).fetchall()
        out: list[ConceptMastery] = []
        for concept_id, name, description in concepts:
            concept_id = int(concept_id)
            view = views.get(concept_id)
            if view is None:
                out.append(
                    ConceptMastery(
                        concept_id=concept_id,
                        name=str(name),
                        description=None if description is None else str(description),
                        label="unseen",
                        m_eff=0.0,
                        retention=0.0,
                        due_for_revisit=False,
                        trail=[],
                    )
                )
                continue
            trail = [
                TrailLine(at=int(str(line["at"])), text=str(line["text"]))
                for line in store.trail(seat_id, concept_id, now, TRAIL_LIMIT)
            ]
            out.append(
                ConceptMastery(
                    concept_id=concept_id,
                    name=str(name),
                    description=None if description is None else str(description),
                    label=view.label,
                    m_eff=view.m_eff,
                    retention=view.retention,
                    due_for_revisit=view.due_for_revisit,
                    trail=trail,
                )
            )
        return out

    return MasteryOut(concepts=await shards.course_reads(course_id).run(read))


@router.get(
    "/revisit",
    response_model=RevisitOut,
    responses={403: {"model": Problem}, 404: {"model": Problem}},
)
async def revisit_queue(
    course_id: int,
    identity: Annotated[Identity, Depends(current_identity)],
    shards: Annotated[ShardManager, Depends(get_shards)],
) -> RevisitOut:
    """The concepts worth a fresh look, most faded first, each with one
    targeted variant (spec section 5): the highest-weight published case
    study for the concept, excluding cases attempted in the last 48 hours,
    drawing an unattempted servable variant from the pool."""
    await ensure_course_reader(shards, course_id, identity)
    seat_id = _require_seat(identity, course_id)
    params = await active_params_json(shards)
    now = int(time.time())

    def read(conn: sqlite3.Connection) -> list[RevisitConcept]:
        store = MasteryStore(conn, params_json=params)
        due = store.revisit_queue(seat_id, now)
        names = {
            int(r[0]): str(r[1])
            for r in conn.execute("SELECT id, name FROM concepts").fetchall()
        }
        return [
            RevisitConcept(
                concept_id=concept_id,
                name=names.get(concept_id, ""),
                variant=_target_variant(conn, seat_id, concept_id, now),
            )
            for concept_id in due
            if concept_id in names
        ]

    return RevisitOut(concepts=await shards.course_reads(course_id).run(read))


def _target_variant(
    conn: sqlite3.Connection, seat_id: int, concept_id: int, now: int
) -> RevisitVariant | None:
    cases = conn.execute(
        "SELECT cs.id, cs.title FROM case_studies cs"
        " JOIN case_study_concepts csc ON csc.case_study_id = cs.id"
        " WHERE csc.concept_id = ? AND cs.status = 'published'"
        " ORDER BY csc.weight DESC, cs.id",
        (concept_id,),
    ).fetchall()
    cutoff = now - ATTEMPT_EXCLUSION_SECONDS
    placeholders = ", ".join("?" for _ in SERVABLE)
    for case_study_id, title in cases:
        case_study_id = int(case_study_id)
        recent = conn.execute(
            "SELECT 1 FROM submissions s JOIN variants v ON v.id = s.variant_id"
            " WHERE s.seat_id = ? AND v.case_study_id = ? AND s.submitted_at >= ?"
            " LIMIT 1",
            (seat_id, case_study_id, cutoff),
        ).fetchone()
        if recent is not None:
            continue
        pick = conn.execute(
            "SELECT v.id FROM variants v"
            f" WHERE v.case_study_id = ? AND v.verification IN ({placeholders})"
            "   AND NOT EXISTS (SELECT 1 FROM submissions s"
            "                   WHERE s.variant_id = v.id AND s.seat_id = ?)"
            " ORDER BY RANDOM() LIMIT 1",
            (case_study_id, *SERVABLE, seat_id),
        ).fetchone()
        if pick is not None:
            return RevisitVariant(
                variant_id=int(pick[0]),
                case_study_id=case_study_id,
                case_study_title=str(title),
            )
    return None


@router.get(
    "/mastery/distribution",
    response_model=DistributionOut,
    responses={403: {"model": Problem}, 404: {"model": Problem}},
)
async def mastery_distribution(
    course_id: int,
    identity: Annotated[Identity, Depends(require_professor)],
    shards: Annotated[ShardManager, Depends(get_shards)],
) -> DistributionOut:
    """The class's relationship to the material, per concept: label counts
    only, no per-seat ranking (spec section 6). Seats that have produced no
    evidence on a concept count as unseen."""
    await ensure_course_owner(shards, course_id, identity)
    params = await active_params_json(shards)
    now = int(time.time())

    def seat_count(conn: sqlite3.Connection) -> int:
        row = conn.execute(
            "SELECT COUNT(*) FROM seats WHERE course_id = ? AND status = 'active'",
            (course_id,),
        ).fetchone()
        return int(row[0])

    total_seats = await shards.directory_reads.run(seat_count)

    def read(conn: sqlite3.Connection) -> list[ConceptDistribution]:
        store = MasteryStore(conn, params_json=params)
        concepts = conn.execute(
            "SELECT id, name FROM concepts ORDER BY position, id"
        ).fetchall()
        gaps = _common_gaps(conn)
        seat_ids = [
            int(r[0])
            for r in conn.execute(
                "SELECT DISTINCT seat_id FROM mastery_state"
            ).fetchall()
        ]
        counts: dict[int, dict[str, int]] = {
            int(cid): {"shaky": 0, "developing": 0, "solid": 0}
            for cid, _ in concepts
        }
        seen: dict[int, int] = {int(cid): 0 for cid, _ in concepts}
        for seat_id in seat_ids:
            for view in store.seat_view(seat_id, now):
                if view.concept_id in counts:
                    seen[view.concept_id] += 1
                    if view.label in counts[view.concept_id]:
                        counts[view.concept_id][view.label] += 1
        return [
            ConceptDistribution(
                concept_id=int(cid),
                name=str(name),
                unseen=max(0, total_seats - seen[int(cid)]),
                shaky=counts[int(cid)]["shaky"],
                developing=counts[int(cid)]["developing"],
                solid=counts[int(cid)]["solid"],
                gaps=gaps.get(int(cid), []),
            )
            for cid, name in concepts
        ]

    return DistributionOut(concepts=await shards.course_reads(course_id).run(read))


GAPS_PER_CONCEPT = 5


def _common_gaps(conn: sqlite3.Connection) -> dict[int, list[str]]:
    """The most common defence-named gaps per concept, verbatim (mastery spec
    section 6): read from the closed conversations' validated rubrics, counted
    by exact wording, most frequent first."""
    tallies: dict[int, Counter[str]] = {}
    rows = conn.execute(
        "SELECT rubric_json FROM conversations WHERE rubric_json IS NOT NULL"
    ).fetchall()
    for (rubric_json,) in rows:
        try:
            rubric = json.loads(str(rubric_json))
        except ValueError:
            continue
        for scored in rubric.get("concepts", []):
            gap = scored.get("gap")
            concept_id = scored.get("concept_id")
            if not gap or not isinstance(concept_id, int):
                continue
            tallies.setdefault(concept_id, Counter())[str(gap)] += 1
    return {
        concept_id: [gap for gap, _n in counter.most_common(GAPS_PER_CONCEPT)]
        for concept_id, counter in tallies.items()
    }


@router.post(
    "/submissions/{submission_id}/grade",
    response_model=GradeOut,
    responses={403: {"model": Problem}, 404: {"model": Problem}},
)
async def grade_submission(
    course_id: int,
    submission_id: int,
    body: GradeIn,
    identity: Annotated[Identity, Depends(require_professor)],
    shards: Annotated[ShardManager, Depends(get_shards)],
) -> GradeOut:
    """The professor grades a submission: ground truth. One professor_grade
    event per mapped concept (confidence 1.0), which triggers the
    supersession replay inside the store, retracting the submission's
    automatic events from the estimate (spec 4.6). Event insert, state
    replay, and the grade column move in one writer transaction."""
    await ensure_course_owner(shards, course_id, identity)
    params = await active_params_json(shards)
    now = int(time.time())

    def grade(conn: sqlite3.Connection) -> None:
        row = conn.execute(
            "SELECT s.seat_id, v.case_study_id FROM submissions s"
            " JOIN variants v ON v.id = s.variant_id WHERE s.id = ?",
            (submission_id,),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Submission not found.")
        seat_id, case_study_id = int(row[0]), int(row[1])
        store = MasteryStore(conn, params_json=params)
        mappings = conn.execute(
            "SELECT concept_id, weight FROM case_study_concepts"
            " WHERE case_study_id = ?",
            (case_study_id,),
        ).fetchall()
        for concept_id, weight in mappings:
            store.record_event(
                seat_id=seat_id,
                concept_id=int(concept_id),
                source="professor_grade",
                score=body.score,
                confidence=1.0,
                k=float(weight),
                ref_kind="grade",
                ref_id=submission_id,
                at=now,
            )
        conn.execute(
            "UPDATE submissions SET grade = ?, graded_at = ? WHERE id = ?",
            (body.score, now, submission_id),
        )

    await shards.course(course_id).run(grade)
    return GradeOut(submission_id=submission_id, score=body.score, graded_at=now)
