"""Decision 0099's backfill: imports confirmed before confirmation normalised
their math delimiters are brought onto dollars, and nothing else moves."""

import sqlite3
from pathlib import Path

from app.compression import compress_text, decompress_text
from app.db.shards import ShardManager
from app.imports.math_backfill import normalize_course
from app.variants.solution import base_solution

OLD_BODY = r"Length \(L = 2\ \mathrm{m}\) costs $5." + "\n\n" + r"\[ \sigma = \frac{F}{A} \]"
OLD_SOLUTION = r"So \(\sigma = 10\ \mathrm{MPa}\)."
STAGED = r"A staged reading keeps \(x\) as the model wrote it."
AUTHORED = r"A hand-authored body with \(y\) never came through an import."


def _seed(conn: sqlite3.Connection) -> dict[str, int]:
    """One case study confirmed before 0099, one staged item, and one case
    study with no import behind it."""
    job = conn.execute(
        "INSERT INTO import_jobs (course_id, storage_key, status, created_at)"
        " VALUES (1, 'k', 'confirmed', 0)"
    ).lastrowid

    def case_study(body: str) -> int:
        return int(
            conn.execute(
                "INSERT INTO case_studies"
                " (author_id, title, body_z, status, created_at, updated_at)"
                " VALUES (1, 't', ?, 'draft', 0, 0)",
                (compress_text(conn, "problem_text", body),),
            ).lastrowid
            or 0
        )

    def item(question: str, solution: str, state: str, cs: int | None) -> int:
        return int(
            conn.execute(
                "INSERT INTO import_items (job_id, title, question_z, solution_z,"
                " page_span, confidence, notes, model_id, prompt_version, state,"
                " case_study_id) VALUES (?, 't', ?, ?, '0', 0.9, NULL, 'm', 'v1', ?, ?)",
                (
                    job,
                    compress_text(conn, "problem_text", question),
                    compress_text(conn, "problem_text", solution),
                    state,
                    cs,
                ),
            ).lastrowid
            or 0
        )

    imported = case_study(OLD_BODY)
    authored = case_study(AUTHORED)
    return {
        "imported": imported,
        "authored": authored,
        "confirmed_item": item(OLD_BODY, OLD_SOLUTION, "confirmed", imported),
        "staged_item": item(STAGED, STAGED, "pending", None),
    }


def _texts(conn: sqlite3.Connection, ids: dict[str, int]) -> dict[str, str | None]:
    def body(cs: int) -> str:
        row = conn.execute("SELECT body_z FROM case_studies WHERE id = ?", (cs,)).fetchone()
        return decompress_text(conn, "problem_text", bytes(row[0]))

    staged = conn.execute(
        "SELECT question_z, solution_z FROM import_items WHERE id = ?", (ids["staged_item"],)
    ).fetchone()
    return {
        "imported": body(ids["imported"]),
        "authored": body(ids["authored"]),
        "solution": base_solution(conn, ids["imported"]),
        "staged_question": decompress_text(conn, "problem_text", bytes(staged[0])),
        "staged_solution": decompress_text(conn, "problem_text", bytes(staged[1])),
    }


async def test_a_dry_run_reports_and_writes_nothing(tmp_path: Path) -> None:
    async with ShardManager(tmp_path) as shards:
        ids = await shards.course(1).run(_seed)
        before = await shards.course_reads(1).run(lambda c: _texts(c, ids))

        report = await normalize_course(shards, 1, apply=False)

        assert report.case_studies_checked == 1
        assert report.bodies == [ids["imported"]]
        assert report.solutions == [ids["confirmed_item"]]
        assert await shards.course_reads(1).run(lambda c: _texts(c, ids)) == before


async def test_apply_rewrites_only_confirmed_import_content(tmp_path: Path) -> None:
    async with ShardManager(tmp_path) as shards:
        ids = await shards.course(1).run(_seed)

        report = await normalize_course(shards, 1, apply=True)

        assert report.bodies == [ids["imported"]]
        texts = await shards.course_reads(1).run(lambda c: _texts(c, ids))
        # What proposal and generation read is now in dollars, the price escaped
        # so it cannot pair with them, and the formula text unchanged.
        assert texts["imported"] == (
            r"Length $L = 2\ \mathrm{m}$ costs \$5." + "\n\n$$\n" + r"\sigma = \frac{F}{A}"
            "\n$$\n\n"
        )
        assert texts["solution"] == r"So $\sigma = 10\ \mathrm{MPa}$."
        # A staged reading and a body that never came through an import are not
        # this backfill's to touch.
        assert texts["staged_question"] == STAGED
        assert texts["staged_solution"] == STAGED
        assert texts["authored"] == AUTHORED


async def test_a_second_run_finds_nothing_to_do(tmp_path: Path) -> None:
    async with ShardManager(tmp_path) as shards:
        ids = await shards.course(1).run(_seed)
        await normalize_course(shards, 1, apply=True)
        after = await shards.course_reads(1).run(lambda c: _texts(c, ids))

        again = await normalize_course(shards, 1, apply=True)

        assert again.bodies == [] and again.solutions == []
        assert await shards.course_reads(1).run(lambda c: _texts(c, ids)) == after
