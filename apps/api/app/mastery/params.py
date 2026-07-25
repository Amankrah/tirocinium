"""The parameter-version migration path (mastery spec sections 7 and 10,
milestone 6.3). The active parameter set lives in the directory database; the
crate's defaults apply when none has been activated. Activating a new version
is followed by a bulk replay of every course shard under the new set, with
the version recorded on each recomputed state, because state is a cache and
the event log plus a parameter version is the truth.
"""

import json
import sqlite3
import time

from platform_core import mastery as _core

from app.db.shards import ShardManager
from mastery_store import MasteryStore


async def active_params_json(shards: ShardManager) -> str:
    """The active parameter set: the directory's active row, else the crate's
    defaults (whose JSON carries its own version id)."""

    def read(conn: sqlite3.Connection) -> str | None:
        row = conn.execute(
            "SELECT params_json FROM mastery_params WHERE active = 1"
            " ORDER BY activated_at DESC LIMIT 1"
        ).fetchone()
        return None if row is None else str(row[0])

    stored = await shards.directory_reads.run(read)
    return stored if stored is not None else _core.default_params_json()


async def activate_params(shards: ShardManager, params_json: str) -> str:
    """Store and activate a parameter version. The JSON must carry a unique
    `version`; the previous active set is deactivated but kept, because the
    version history is part of the audit trail (spec 10)."""
    version = str(json.loads(params_json)["version"])
    now = int(time.time())

    def write(conn: sqlite3.Connection) -> None:
        conn.execute("UPDATE mastery_params SET active = 0 WHERE active = 1")
        conn.execute(
            "INSERT INTO mastery_params (version, params_json, active, activated_at)"
            " VALUES (?, ?, 1, ?)"
            " ON CONFLICT(version) DO UPDATE SET"
            "   params_json = excluded.params_json, active = 1,"
            "   activated_at = excluded.activated_at",
            (version, params_json, now),
        )

    await shards.directory.run(write)
    return version


async def replay_course(
    shards: ShardManager, course_id: int, params_json: str
) -> int:
    """Recompute every cached (seat, concept) state in one course shard under
    the given parameter set, in one writer transaction, recording the new
    version on each row. Returns the number of states recomputed."""

    def replay(conn: sqlite3.Connection) -> int:
        store = MasteryStore(conn, params_json=params_json)
        pairs = conn.execute(
            "SELECT seat_id, concept_id FROM mastery_state"
        ).fetchall()
        for seat_id, concept_id in pairs:
            store.recompute(int(seat_id), int(concept_id))
        return len(pairs)

    return await shards.course(course_id).run(replay)


async def course_ids(shards: ShardManager) -> list[int]:
    def read(conn: sqlite3.Connection) -> list[int]:
        return [int(r[0]) for r in conn.execute("SELECT id FROM courses ORDER BY id")]

    return await shards.directory_reads.run(read)


async def activate_and_replay_all(
    shards: ShardManager, params_json: str
) -> dict[str, int]:
    """The whole migration: activate the version, then replay every course
    shard under it. Returns counts for the operator's log."""
    await activate_params(shards, params_json)
    courses = await course_ids(shards)
    states = 0
    for course_id in courses:
        states += await replay_course(shards, course_id, params_json)
    return {"courses": len(courses), "states": states}
