"""Reading a stored variant solution back to markdown.

The generation loop stores a variant's solution as a JSON blob carrying
`solution_md` alongside the structured final answers (milestone 5.3), while
older and hand-seeded rows hold the markdown directly. Both readers of that
column (the tutor's context assembly and the understanding unfold) need the
same tolerance, so it lives here once rather than twice.
"""

import json
import sqlite3

from app.compression import decompress_text


def solution_markdown(blob_text: str) -> str:
    """The worked solution as markdown, whether the column holds the 5.3 JSON
    blob or bare markdown."""
    try:
        parsed = json.loads(blob_text)
    except ValueError:
        return blob_text
    if isinstance(parsed, dict):
        return str(parsed.get("solution_md", blob_text))
    return blob_text


def base_solution(conn: sqlite3.Connection, case_study_id: int) -> str | None:
    """The professor's own worked solution for a case study, by whichever route
    the case study came in.

    Both the auto-parameterization proposal and the generation loop need this:
    the question alone says what the numbers are, and only the solution says
    which of them are inputs and which are derived. A proposal drafted without
    it will happily offer to vary an answer.

    Imported content keeps the solution on the confirmed import item, which was
    the only route that existed when 5.2 and 5.3 were written. A course pack
    (decision 0077) has no import item at all and keeps it on the base variant
    it loaded, stored in the 5.3 blob shape, so that is read back through
    `solution_markdown` like any other variant solution. Returns None when the
    case study genuinely has no worked solution, which a hand-authored one
    does not.
    """
    row = conn.execute(
        "SELECT solution_z FROM import_items"
        " WHERE case_study_id = ? AND state = 'confirmed'"
        " ORDER BY id DESC LIMIT 1",
        (case_study_id,),
    ).fetchone()
    if row is not None and row[0] is not None:
        return decompress_text(conn, "problem_text", bytes(row[0]))

    row = conn.execute(
        "SELECT v.solution_z FROM variants v"
        " JOIN course_pack_items i ON i.variant_id = v.id"
        " WHERE i.case_study_id = ?",
        (case_study_id,),
    ).fetchone()
    if row is None or row[0] is None:
        return None
    return solution_markdown(decompress_text(conn, "problem_text", bytes(row[0])))
