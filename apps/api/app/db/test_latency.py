"""The Phase 1 latency gate: p95 on the read path against the realistic
50-case, 500-submission fixture shard stays inside the backend guide's
150 ms budget for API reads. Measured over the ReadPool exactly as the API
reads, including blob decompression."""

import sqlite3
import time
from pathlib import Path

from app.compression import decompress_text
from app.db.fixtures import SEATS, build_course_shard
from app.db.pool import ReadPool

BUDGET_SECONDS = 0.150
ITERATIONS = 120


async def test_read_path_p95_within_budget(tmp_path: Path) -> None:
    shard = build_course_shard(tmp_path / "course.db")
    pool = ReadPool(shard, size=4)
    try:
        durations: list[float] = []
        for i in range(ITERATIONS):
            case_id = 1 + i % 50
            seat_id = 1 + i % SEATS

            def read(
                conn: sqlite3.Connection, case_id: int = case_id, seat_id: int = seat_id
            ) -> tuple[str, int]:
                blob = conn.execute(
                    "SELECT body_z FROM case_studies WHERE id = ?", (case_id,)
                ).fetchone()[0]
                body = decompress_text(conn, "problem_text", blob)
                count = conn.execute(
                    "SELECT COUNT(*) FROM submissions WHERE seat_id = ?", (seat_id,)
                ).fetchone()[0]
                return body[:20], int(count)

            started = time.perf_counter()
            body_head, _count = await pool.run(read)
            durations.append(time.perf_counter() - started)
            assert body_head.startswith("# Case study")

        durations.sort()
        p95 = durations[int(len(durations) * 0.95) - 1]
        assert p95 < BUDGET_SECONDS, f"read-path p95 {p95 * 1000:.1f} ms over budget"
    finally:
        pool.close()
