"""The understanding unfold and the personal history view (milestone 8.4).

Two seat-facing surfaces, both about the student's own record.

The unfold (frontend guide 4.2) is the professor's worked solution, revealed a
step at a time. It becomes available once the student has done the work, which
means one of two things: they submitted a solution for this variant, or they
explicitly gave up on it. Giving up is a deliberate act with a deliberate
endpoint, not a side effect of navigating, because "reading the solution is
itself an act of engagement" only holds if choosing to read it is a choice. The
step counter is not a limit on the student (unfolding is free), it is what lets
the tutor discuss a step they have read while still never volunteering one they
have not, and it is why `solution_reveals` records it.

The history view is the honest record of engaged work that frontend 4.2b says a
student stays for: their own submissions, newest first, with what became of
each. A seat sees only its own, and the whole surface knows a student only as a
seat.
"""

import sqlite3
import time
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.auth.deps import current_identity, get_shards
from app.auth.models import Identity, Role
from app.compression import decompress_text
from app.courses.routes import ensure_course_reader
from app.db.shards import ShardManager
from app.problems import Problem
from app.unfold.steps import split_solution
from app.variants.solution import solution_markdown

router = APIRouter(prefix="/api/v1/courses/{course_id}", tags=["unfold"])

DEFAULT_LIMIT = 25
MAX_LIMIT = 100

NOT_EARNED = (
    "The solution opens once you have submitted your work, or if you choose to"
    " give up on this one."
)


class SolutionStep(BaseModel):
    number: int
    markdown: str


class UnfoldOut(BaseModel):
    """The solution as far as the student has unfolded it. `total_steps` is
    always honest so the interface can show how much is left; the text of an
    unrevealed step is simply not here."""

    variant_id: int
    total_steps: int
    steps_revealed: int
    gave_up: bool
    steps: list[SolutionStep]


class RevealIn(BaseModel):
    """Unfold through this step number, 1-based. Setting a target rather than
    incrementing makes a retry harmless."""

    through_step: int = Field(ge=0, le=1000)


class HistoryEntry(BaseModel):
    submission_id: int
    variant_id: int
    case_study_id: int
    case_study_title: str
    status: str
    submitted_at: int
    recognition_conf: float | None
    grade: float | None
    defended: bool
    concept_to_revisit: int | None
    solution_unfolded: bool


class HistoryOut(BaseModel):
    entries: list[HistoryEntry]
    next_cursor: int | None


def _seat_of(identity: Identity, course_id: int) -> int | None:
    """The seat making this call, or None for a professor. Professors reach
    the unfold as authors, not as students, so they have no reveal state."""
    if identity.role is not Role.SEAT:
        return None
    if identity.course_id != course_id:
        raise HTTPException(status_code=403, detail="This is not your course.")
    assert identity.seat_id is not None
    return identity.seat_id


def _load_solution(
    conn: sqlite3.Connection, course_id: int, variant_id: int, published_only: bool
) -> str:
    """The variant's worked solution, or a 404 that does not distinguish a
    missing variant from one a seat may not see."""
    row = conn.execute(
        "SELECT v.solution_z, cs.status FROM variants v"
        " JOIN case_studies cs ON cs.id = v.case_study_id"
        " WHERE v.id = ?",
        (variant_id,),
    ).fetchone()
    if row is None or (published_only and str(row[1]) != "published"):
        raise HTTPException(status_code=404, detail="Variant not found.")
    return solution_markdown(decompress_text(conn, "problem_text", bytes(row[0])))


def _reveal_state(
    conn: sqlite3.Connection, variant_id: int, seat_id: int
) -> tuple[int, bool] | None:
    row = conn.execute(
        "SELECT steps_revealed, gave_up FROM solution_reveals"
        " WHERE variant_id = ? AND seat_id = ?",
        (variant_id, seat_id),
    ).fetchone()
    return None if row is None else (int(row[0]), bool(row[1]))


def _has_submitted(conn: sqlite3.Connection, variant_id: int, seat_id: int) -> bool:
    return (
        conn.execute(
            "SELECT 1 FROM submissions WHERE variant_id = ? AND seat_id = ? LIMIT 1",
            (variant_id, seat_id),
        ).fetchone()
        is not None
    )


@router.get(
    "/variants/{variant_id}/solution",
    response_model=UnfoldOut,
    responses={401: {"model": Problem}, 403: {"model": Problem}, 404: {"model": Problem}},
)
async def read_solution(
    course_id: int,
    variant_id: int,
    identity: Annotated[Identity, Depends(current_identity)],
    shards: Annotated[ShardManager, Depends(get_shards)],
) -> UnfoldOut:
    """The unfold as it currently stands. A professor who owns the course sees
    the whole solution, because they wrote it; a seat sees what they have
    unfolded, and gets an honest 403 before they have earned any of it."""
    can_see_drafts = await ensure_course_reader(shards, course_id, identity)
    seat_id = _seat_of(identity, course_id)

    def read(conn: sqlite3.Connection) -> UnfoldOut:
        solution = _load_solution(conn, course_id, variant_id, not can_see_drafts)
        steps = split_solution(solution)
        if seat_id is None:
            return UnfoldOut(
                variant_id=variant_id,
                total_steps=len(steps),
                steps_revealed=len(steps),
                gave_up=False,
                steps=[
                    SolutionStep(number=s.index + 1, markdown=s.markdown) for s in steps
                ],
            )
        state = _reveal_state(conn, variant_id, seat_id)
        if state is None and not _has_submitted(conn, variant_id, seat_id):
            raise HTTPException(status_code=403, detail=NOT_EARNED)
        revealed, gave_up = state if state is not None else (0, False)
        visible = min(revealed, len(steps))
        return UnfoldOut(
            variant_id=variant_id,
            total_steps=len(steps),
            steps_revealed=visible,
            gave_up=gave_up,
            steps=[
                SolutionStep(number=s.index + 1, markdown=s.markdown)
                for s in steps[:visible]
            ],
        )

    return await shards.course_reads(course_id).run(read)


@router.post(
    "/variants/{variant_id}/solution/reveal",
    response_model=UnfoldOut,
    responses={401: {"model": Problem}, 403: {"model": Problem}, 404: {"model": Problem}},
)
async def reveal_solution_steps(
    course_id: int,
    variant_id: int,
    body: RevealIn,
    identity: Annotated[Identity, Depends(current_identity)],
    shards: Annotated[ShardManager, Depends(get_shards)],
) -> UnfoldOut:
    """Unfold through a step. For a student who has not submitted, the first
    call is the act of giving up on this variant and is recorded as such: the
    platform never pretends a solution was earned when it was asked for. The
    target is absolute, so a retry or an out-of-order call never rewinds what
    is already read and never double-counts."""
    can_see_drafts = await ensure_course_reader(shards, course_id, identity)
    seat_id = _seat_of(identity, course_id)
    if seat_id is None:
        # A professor has nothing to unfold; the read already gives them all.
        return await read_solution(course_id, variant_id, identity, shards)
    now = int(time.time())

    def apply(conn: sqlite3.Connection) -> None:
        solution = _load_solution(conn, course_id, variant_id, not can_see_drafts)
        total = len(split_solution(solution))
        target = min(body.through_step, total)
        state = _reveal_state(conn, variant_id, seat_id)
        if state is None:
            gave_up = not _has_submitted(conn, variant_id, seat_id)
            conn.execute(
                "INSERT INTO solution_reveals (variant_id, seat_id, gave_up,"
                " steps_revealed, first_revealed_at, updated_at)"
                " VALUES (?, ?, ?, ?, ?, ?)",
                (variant_id, seat_id, int(gave_up), target, now, now),
            )
            return
        revealed, _ = state
        if target > revealed:
            conn.execute(
                "UPDATE solution_reveals SET steps_revealed = ?, updated_at = ?"
                " WHERE variant_id = ? AND seat_id = ?",
                (target, now, variant_id, seat_id),
            )

    await shards.course(course_id).run(apply)
    return await read_solution(course_id, variant_id, identity, shards)


@router.get(
    "/history",
    response_model=HistoryOut,
    responses={401: {"model": Problem}, 403: {"model": Problem}, 404: {"model": Problem}},
)
async def personal_history(
    course_id: int,
    identity: Annotated[Identity, Depends(current_identity)],
    shards: Annotated[ShardManager, Depends(get_shards)],
    cursor: int | None = None,
    limit: int = DEFAULT_LIMIT,
) -> HistoryOut:
    """The seat's own record of work, newest first: what they attempted, how it
    was read, what it was graded, whether they defended it, and whether they
    unfolded the solution. Seat-only, like the mastery picture: a professor
    reads the class through the reporting surfaces, never a student's history
    dressed up as their own view."""
    await ensure_course_reader(shards, course_id, identity)
    seat_id = _seat_of(identity, course_id)
    if seat_id is None:
        raise HTTPException(
            status_code=403, detail="This view belongs to a seat in the course."
        )
    limit = max(1, min(int(limit), MAX_LIMIT))
    # Newest first, so the cursor walks backwards through ids.
    before = cursor if cursor is not None else None

    def read(conn: sqlite3.Connection) -> tuple[list[HistoryEntry], int | None]:
        clause = " AND s.id < ?" if before is not None else ""
        params: list[object] = [seat_id]
        if before is not None:
            params.append(before)
        rows = conn.execute(
            "SELECT s.id, s.variant_id, v.case_study_id, cs.title, s.status,"
            " s.submitted_at, s.recognition_conf, s.grade,"
            " (SELECT COUNT(*) FROM conversations c"
            "  WHERE c.submission_id = s.id AND c.rubric_json IS NOT NULL),"
            " (SELECT c.concept_to_revisit FROM conversations c"
            "  WHERE c.submission_id = s.id AND c.rubric_json IS NOT NULL"
            "  ORDER BY c.id DESC LIMIT 1),"
            " (SELECT sr.steps_revealed FROM solution_reveals sr"
            "  WHERE sr.variant_id = s.variant_id AND sr.seat_id = s.seat_id)"
            " FROM submissions s"
            " JOIN variants v ON v.id = s.variant_id"
            " JOIN case_studies cs ON cs.id = v.case_study_id"
            f" WHERE s.seat_id = ?{clause}"
            " ORDER BY s.id DESC LIMIT ?",
            (*params, limit + 1),
        ).fetchall()
        page = rows[:limit]
        entries = [
            HistoryEntry(
                submission_id=int(r[0]),
                variant_id=int(r[1]),
                case_study_id=int(r[2]),
                case_study_title=str(r[3]),
                status=str(r[4]),
                submitted_at=int(r[5]),
                recognition_conf=None if r[6] is None else float(r[6]),
                grade=None if r[7] is None else float(r[7]),
                defended=int(r[8]) > 0,
                concept_to_revisit=None if r[9] is None else int(r[9]),
                solution_unfolded=r[10] is not None and int(r[10]) > 0,
            )
            for r in page
        ]
        next_cursor = int(page[-1][0]) if len(rows) > limit else None
        return entries, next_cursor

    entries, next_cursor = await shards.course_reads(course_id).run(read)
    return HistoryOut(entries=entries, next_cursor=next_cursor)
