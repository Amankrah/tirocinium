"""The 30-day purge of unconfirmed imports (backend guide section 5 Stage 3,
milestone 4.3). Extracted content is staging: an import job the professor never
confirms, and its items and figure links, are removed after 30 days, and
figures no item references anymore are removed with them. Confirmed jobs are
left alone (their figures re-parent to case studies at confirmation), and so are
recent jobs, whose figures may not be assigned to an item yet.

Runs per course shard; a maintenance script iterates the courses. Object-storage
cleanup of a purged figure's bytes is a separate garbage pass and is not done
here (the rows go, the deduped objects are swept later); this removes only shard
rows.
"""

import sqlite3
from collections.abc import Callable

from app.db.shards import ShardManager

THIRTY_DAYS_SECONDS = 30 * 24 * 3600


async def purge_stale_imports(
    *,
    shards: ShardManager,
    course_id: int,
    now: int,
    ttl_seconds: int = THIRTY_DAYS_SECONDS,
) -> dict[str, int]:
    """Purge one course's unconfirmed imports older than the TTL. Returns the
    counts removed: jobs, items, and orphaned figures."""
    cutoff = now - ttl_seconds
    return await shards.course(course_id).run(_purge(cutoff))


def _purge(cutoff: int) -> Callable[[sqlite3.Connection], dict[str, int]]:
    def apply(conn: sqlite3.Connection) -> dict[str, int]:
        stale_jobs = [
            int(row[0])
            for row in conn.execute(
                "SELECT id FROM import_jobs WHERE status <> 'confirmed' AND created_at < ?",
                (cutoff,),
            ).fetchall()
        ]
        items_removed = 0
        for job_id in stale_jobs:
            item_ids = [
                int(row[0])
                for row in conn.execute(
                    "SELECT id FROM import_items WHERE job_id = ?", (job_id,)
                ).fetchall()
            ]
            for item_id in item_ids:
                conn.execute("DELETE FROM item_figures WHERE item_id = ?", (item_id,))
            items_removed += len(item_ids)
            conn.execute("DELETE FROM import_items WHERE job_id = ?", (job_id,))
            conn.execute("DELETE FROM import_pages WHERE job_id = ?", (job_id,))
            conn.execute(
                "DELETE FROM import_idempotency_keys WHERE import_id = ?", (job_id,)
            )
            conn.execute("DELETE FROM import_jobs WHERE id = ?", (job_id,))

        # Orphaned figures: referenced by no item and old enough to be sure they
        # are not a recent job's not-yet-assigned figures.
        figures_removed = conn.execute(
            "DELETE FROM figures WHERE created_at < ?"
            " AND id NOT IN (SELECT figure_id FROM item_figures)",
            (cutoff,),
        ).rowcount

        return {
            "jobs": len(stale_jobs),
            "items": items_removed,
            "figures": int(figures_removed),
        }

    return apply
