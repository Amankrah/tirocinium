"""Bring imports confirmed before decision 0099 onto dollar delimiters.

Confirmation has normalised math delimiters since 0099. A case study confirmed
before it can still carry the transcription prompts' `\\( \\)` and `\\[ \\]` in
its body and in its confirmed item's solution, which is what auto-
parameterization and generation read. This applies the same `normalize_math`
to exactly those two texts, nothing else: staged items stay as the model wrote
them, and course-pack and hand-authored content never came through an import.
The rewrite is idempotent, so a second run reports nothing to do.
"""

import sqlite3

from pydantic import BaseModel

from app.compression import compress_text, decompress_text
from app.db.shards import ShardManager
from app.math_delimiters import normalize_math


class CourseReport(BaseModel):
    course_id: int
    case_studies_checked: int
    bodies: list[int]  # case study ids whose body changed (or would)
    solutions: list[int]  # import item ids whose solution changed (or would)


def _rows(conn: sqlite3.Connection) -> list[tuple[int, int, bytes, bytes | None]]:
    rows = conn.execute(
        "SELECT i.id, cs.id, cs.body_z, i.solution_z"
        " FROM import_items i JOIN case_studies cs ON cs.id = i.case_study_id"
        " WHERE i.state = 'confirmed'"
        " ORDER BY cs.id, i.id"
    ).fetchall()
    return [
        (int(item), int(cs), bytes(body), None if sol is None else bytes(sol))
        for item, cs, body, sol in rows
    ]


def _plan(
    conn: sqlite3.Connection,
) -> tuple[int, dict[int, str], dict[int, str]]:
    """The rewrites to make: case study id to new body, item id to new solution."""
    bodies: dict[int, str] = {}
    solutions: dict[int, str] = {}
    case_studies: set[int] = set()
    for item_id, case_study_id, body_z, solution_z in _rows(conn):
        case_studies.add(case_study_id)
        body = decompress_text(conn, "problem_text", body_z)
        if (normalized := normalize_math(body)) != body:
            bodies[case_study_id] = normalized
        if solution_z is not None:
            solution = decompress_text(conn, "problem_text", solution_z)
            if (normalized := normalize_math(solution)) != solution:
                solutions[item_id] = normalized
    return len(case_studies), bodies, solutions


async def normalize_course(
    shards: ShardManager, course_id: int, *, apply: bool
) -> CourseReport:
    """Report, and with `apply` make, the rewrites for one course. Applying
    plans and writes inside one writer transaction, so a confirmation landing
    meanwhile cannot be overwritten with a stale read."""

    def write(conn: sqlite3.Connection) -> tuple[int, dict[int, str], dict[int, str]]:
        checked, bodies, solutions = _plan(conn)
        for case_study_id, body in bodies.items():
            conn.execute(
                "UPDATE case_studies SET body_z = ? WHERE id = ?",
                (compress_text(conn, "problem_text", body), case_study_id),
            )
        for item_id, solution in solutions.items():
            conn.execute(
                "UPDATE import_items SET solution_z = ? WHERE id = ?",
                (compress_text(conn, "problem_text", solution), item_id),
            )
        return checked, bodies, solutions

    if apply:
        checked, bodies, solutions = await shards.course(course_id).run(write)
    else:
        checked, bodies, solutions = await shards.course_reads(course_id).run(_plan)
    return CourseReport(
        course_id=course_id,
        case_studies_checked=checked,
        bodies=sorted(bodies),
        solutions=sorted(solutions),
    )
