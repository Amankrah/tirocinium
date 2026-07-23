"""The realistic course-shard fixture of backend guide section 8: 50 case
studies and 500 submissions, deterministic, with compressed blob columns.
Used by the data-layer tests and the Phase 1 latency gate; the golden scan
and PDF corpora are separate assets arriving in Phases 3 and 4."""

import random
from pathlib import Path

from app.compression import compress_text
from app.db.connection import connect
from app.db.migrations import apply_migrations
from app.db.shards import COURSE_MIGRATIONS

SEATS = 80


def build_course_shard(
    path: Path, cases: int = 50, submissions: int = 500, seed: int = 42
) -> Path:
    rng = random.Random(seed)
    conn = connect(path)
    apply_migrations(conn, COURSE_MIGRATIONS)
    now = 1_750_000_000

    for case_id in range(1, cases + 1):
        body = (
            f"# Case study {case_id}\n\n"
            f"The firm's discount rate is {4 + case_id % 8}.{case_id % 10} percent"
            f" and the cashflow horizon is {4 + case_id % 5} years. Compute the"
            " net present value of the expansion and state whether the project"
            " should proceed. Show the discounting step by step.\n" * 6
        )
        conn.execute(
            "INSERT INTO case_studies"
            " (id, author_id, title, body_z, status, created_at, updated_at)"
            " VALUES (?, 1, ?, ?, 'published', ?, ?)",
            (case_id, f"Case study {case_id}", compress_text(conn, "problem_text", body), now, now),
        )
        for v in range(2):
            variant_id = case_id * 10 + v
            conn.execute(
                "INSERT INTO variants"
                " (id, case_study_id, seed_json_z, body_z, solution_z,"
                "  verification, model_id, created_at)"
                " VALUES (?, ?, ?, ?, ?, 'verified', 'fixture-model', ?)",
                (
                    variant_id,
                    case_id,
                    compress_text(conn, "problem_text", f'{{"seed": {variant_id}}}'),
                    compress_text(
                        conn,
                        "problem_text",
                        body.replace("expansion", f"expansion v{v}"),
                    ),
                    compress_text(
                        conn,
                        "problem_text",
                        f"Worked solution for variant {variant_id}.",
                    ),
                    now,
                ),
            )

    for sub_id in range(1, submissions + 1):
        case_id = rng.randrange(1, cases + 1)
        variant_id = case_id * 10 + rng.randrange(2)
        seat_id = rng.randrange(1, SEATS + 1)
        recognized = (
            f"Submission {sub_id}: NPV computed by discounting each cashflow at"
            " the stated rate; final answer boxed on the last line." * 3
        )
        conn.execute(
            "INSERT INTO submissions"
            " (id, variant_id, seat_id, page_count, storage_prefix, recognized_z,"
            "  recognition_conf, status, submitted_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, 'processed', ?)",
            (
                sub_id,
                variant_id,
                seat_id,
                1 + rng.randrange(4),
                f"scans/{sub_id}",
                compress_text(conn, "handwriting", recognized),
                0.5 + rng.random() / 2,
                now + sub_id,
            ),
        )

    conn.close()
    return path
