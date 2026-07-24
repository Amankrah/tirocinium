"""Milestone 4.3 purge tests. An unconfirmed import older than 30 days, with its
items and figure links, is removed, and figures nothing references anymore go
with it; a confirmed job and a recent job (and their figures) are spared."""

import sqlite3
from pathlib import Path

from app.compression import compress_text
from app.db.shards import ShardManager
from app.imports.purge import THIRTY_DAYS_SECONDS, purge_stale_imports

NOW = 100 * THIRTY_DAYS_SECONDS  # comfortably past the TTL for created_at=0 rows


def _figure(conn: sqlite3.Connection, tag: str, created_at: int) -> int:
    cur = conn.execute(
        "INSERT INTO figures (content_hash, storage_key, source, width_px, height_px,"
        " created_at) VALUES (?, ?, 'embedded_raster', 10, 10, ?)",
        (f"hash-{tag}", f"figures/{tag}.jpeg", created_at),
    )
    return int(cur.lastrowid or 0)


def _job(conn: sqlite3.Connection, status: str, created_at: int) -> int:
    cur = conn.execute(
        "INSERT INTO import_jobs (course_id, storage_key, status, created_at)"
        " VALUES (1, 'k', ?, ?)",
        (status, created_at),
    )
    return int(cur.lastrowid or 0)


def _item(conn: sqlite3.Connection, job_id: int, figure_id: int | None) -> int:
    cur = conn.execute(
        "INSERT INTO import_items (job_id, question_z, page_span, confidence,"
        " model_id, prompt_version, state) VALUES (?, ?, '0', 0.9, 'm', 'v1', 'pending')",
        (job_id, compress_text(conn, "problem_text", "q")),
    )
    item_id = int(cur.lastrowid or 0)
    if figure_id is not None:
        conn.execute(
            "INSERT INTO item_figures (item_id, figure_id, role)"
            " VALUES (?, ?, 'essential')",
            (item_id, figure_id),
        )
    return item_id


async def test_purge_removes_stale_unconfirmed_spares_the_rest(tmp_path: Path) -> None:
    async with ShardManager(tmp_path) as shards:
        def seed(conn: sqlite3.Connection) -> dict[str, int]:
            fig_a = _figure(conn, "a", 0)  # old, linked only to the stale job
            fig_b = _figure(conn, "b", NOW)  # recent, linked to a recent job
            fig_c = _figure(conn, "c", 0)  # old, linked to a confirmed job
            fig_d = _figure(conn, "d", 0)  # old, orphaned -> purged
            fig_e = _figure(conn, "e", NOW)  # recent, orphaned -> spared

            stale = _job(conn, "ready", 0)
            stale_item = _item(conn, stale, fig_a)
            recent = _job(conn, "ready", NOW)
            _item(conn, recent, fig_b)
            confirmed = _job(conn, "confirmed", 0)
            _item(conn, confirmed, fig_c)

            return {
                "stale": stale, "stale_item": stale_item, "recent": recent,
                "confirmed": confirmed,
                "a": fig_a, "b": fig_b, "c": fig_c, "d": fig_d, "e": fig_e,
            }

        ids = await shards.course(1).run(seed)

        counts = await purge_stale_imports(shards=shards, course_id=1, now=NOW)

        def read(conn: sqlite3.Connection) -> dict[str, list[int]]:
            def ids_from(query: str) -> list[int]:
                return [int(r[0]) for r in conn.execute(query).fetchall()]

            return {
                "jobs": ids_from("SELECT id FROM import_jobs"),
                "items": ids_from("SELECT id FROM import_items"),
                "figures": ids_from("SELECT id FROM figures"),
                "links": ids_from("SELECT item_id FROM item_figures"),
            }

        state = await shards.course_reads(1).run(read)

    assert counts == {"jobs": 1, "items": 1, "figures": 2}  # stale job, its item, figures a+d
    assert ids["stale"] not in state["jobs"]
    assert ids["recent"] in state["jobs"] and ids["confirmed"] in state["jobs"]
    assert ids["stale_item"] not in state["items"]
    # Figures: a (orphaned by the purge) and d (already orphaned) gone; b, c, e stay.
    assert sorted(state["figures"]) == sorted([ids["b"], ids["c"], ids["e"]])
    assert ids["stale_item"] not in state["links"]
