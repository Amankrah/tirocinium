"""Milestone 6.3: the parameter-version migration path. Activation stores the
new set in the directory as the active version, and the bulk replay
recomputes every cached state under it, recording the version on each row
(mastery spec section 10: state is a cache, the log plus a version is the
truth)."""

import json
import sqlite3
from pathlib import Path

from platform_core import mastery as _core

from app.db.shards import ShardManager
from app.mastery.params import (
    activate_and_replay_all,
    activate_params,
    active_params_json,
    replay_course,
)
from mastery_store import MasteryStore

DAY = 86_400


def tuned_params(version: str = "tuned-1") -> str:
    params = json.loads(_core.default_params_json())
    params["version"] = version
    params["alpha_base"] = 0.5  # a deliberate, visible retuning
    return json.dumps(params)


def seed_history(conn: sqlite3.Connection) -> None:
    conn.execute("INSERT INTO concepts (id, name, position) VALUES (7, 'DCF', 1)")
    store = MasteryStore(conn)
    for day in range(4):
        store.record_event(
            seat_id=1, concept_id=7, source="answer_match",
            score=1.0, confidence=0.95, k=1.0,
            ref_kind="submission", ref_id=day, at=day * DAY,
        )


async def test_defaults_apply_until_a_version_is_activated(
    tmp_path: Path,
) -> None:
    async with ShardManager(tmp_path) as shards:
        assert (
            json.loads(await active_params_json(shards))["version"]
            == json.loads(_core.default_params_json())["version"]
        )
        await activate_params(shards, tuned_params())
        active = json.loads(await active_params_json(shards))
    assert active["version"] == "tuned-1"
    assert active["alpha_base"] == 0.5


async def test_the_bulk_replay_recomputes_under_the_new_version(
    tmp_path: Path,
) -> None:
    async with ShardManager(tmp_path) as shards:

        def register(conn: sqlite3.Connection) -> None:
            conn.execute(
                "INSERT INTO courses (id, title, created_at) VALUES (1, 'EE', 0)"
            )

        await shards.directory.run(register)
        await shards.course(1).run(seed_history)

        def state(conn: sqlite3.Connection) -> tuple[str, str]:
            row = conn.execute(
                "SELECT state_json, params_version FROM mastery_state"
                " WHERE seat_id = 1 AND concept_id = 7"
            ).fetchone()
            return str(row[0]), str(row[1])

        before_json, before_version = await shards.course_reads(1).run(state)
        counts = await activate_and_replay_all(shards, tuned_params())
        after_json, after_version = await shards.course_reads(1).run(state)

    assert counts == {"courses": 1, "states": 1}
    assert before_version != "tuned-1"
    assert after_version == "tuned-1"
    # A faster learning rate genuinely changes the recomputed estimate.
    assert json.loads(after_json)["m"] > json.loads(before_json)["m"]


async def test_replay_is_per_course_and_complete(tmp_path: Path) -> None:
    async with ShardManager(tmp_path) as shards:
        await shards.course(1).run(seed_history)

        def second_seat(conn: sqlite3.Connection) -> None:
            store = MasteryStore(conn)
            store.record_event(
                seat_id=2, concept_id=7, source="answer_match",
                score=0.0, confidence=0.9, k=1.0,
                ref_kind="submission", ref_id=99, at=0,
            )

        await shards.course(1).run(second_seat)
        replayed = await replay_course(shards, 1, tuned_params())

        def versions(conn: sqlite3.Connection) -> set[str]:
            return {
                str(r[0])
                for r in conn.execute(
                    "SELECT params_version FROM mastery_state"
                ).fetchall()
            }

        stamped = await shards.course_reads(1).run(versions)
    assert replayed == 2
    assert stamped == {"tuned-1"}
