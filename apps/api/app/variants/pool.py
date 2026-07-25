"""The variant pool (backend guide 6.3/6.4, milestone 5.4). Publishing a
spec'd case study enqueues a pool fill; the fill job generates seeded
variants until the pool holds the target number of servable ones (verified or
manual), so a student's "new variant" request is always answered from what
already exists and never waits on generation.

The fill runs sequentially inside one job per case study, which is the
concurrency cap made structural: one generation call in flight per case study,
however many fills are requested (the broker's job id and the seed dedupe
collapse the rest). A monthly per-course token budget bounds spend; a course
that has exhausted it simply stops generating (the pool serves what it has,
the professor sees an honest shortfall), and the budget check reads the same
token_usage table the accounting writes.
"""

import os
import secrets
import sqlite3
import time

from app.db.shards import ShardManager
from app.storage import ObjectStorage
from app.variants.model import VariantGenerator, VariantVerifier
from app.variants.pipeline import VERIFIED, generate_variant

SERVABLE_STATES = ("verified", "manual")
BUDGET_WINDOW_SECONDS = 30 * 24 * 3600
_SEED_BITS = 62


def pool_target() -> int:
    """The pool size (guide 6.3: default 20 verified variants per published
    case study)."""
    return int(os.environ.get("TIRO_VARIANT_POOL_TARGET", "20"))


def generation_token_budget() -> int:
    """The per-course generation budget over a rolling 30 days, in total
    tokens (input plus output). Deliberately generous by default; zero turns
    generation off entirely, which is exactly the empty-budget simulation the
    pool invariant is asserted under."""
    return int(os.environ.get("TIRO_GENERATION_TOKEN_BUDGET", "50000000"))


def count_servable(conn: sqlite3.Connection, case_study_id: int) -> int:
    row = conn.execute(
        "SELECT COUNT(*) FROM variants"
        " WHERE case_study_id = ? AND verification IN (?, ?)",
        (case_study_id, *SERVABLE_STATES),
    ).fetchone()
    return int(row[0])


def tokens_used(conn: sqlite3.Connection, since: int) -> int:
    row = conn.execute(
        "SELECT COALESCE(SUM(input_tokens + output_tokens), 0)"
        " FROM token_usage WHERE created_at >= ?",
        (since,),
    ).fetchone()
    return int(row[0])


async def fill_pool(
    *,
    shards: ShardManager,
    storage: ObjectStorage,
    generator: VariantGenerator,
    verifier: VariantVerifier,
    course_id: int,
    case_study_id: int,
    target: int | None = None,
    budget: int | None = None,
) -> dict[str, int]:
    """Top the pool up to the target, one seeded generation at a time.
    Idempotent: a rerun generates only the shortfall. Flagged results do not
    count toward the target but do count against the attempt ceiling (a
    case study whose variants keep flagging stops burning budget rather than
    looping; the professor's review queue shows why). Returns counts for the
    job log."""
    goal = pool_target() if target is None else target
    allowance = generation_token_budget() if budget is None else budget
    attempts = generated = flagged = 0
    max_attempts = goal * 3
    budget_exhausted = False

    def read_servable(conn: sqlite3.Connection) -> int:
        return count_servable(conn, case_study_id)

    while attempts < max_attempts:
        servable = await shards.course_reads(course_id).run(read_servable)
        if servable >= goal:
            break
        since = int(time.time()) - BUDGET_WINDOW_SECONDS

        def read_used(conn: sqlite3.Connection, s: int = since) -> int:
            return tokens_used(conn, s)

        used = await shards.course_reads(course_id).run(read_used)
        if used >= allowance:
            budget_exhausted = True
            break
        attempts += 1
        state = await generate_variant(
            shards=shards,
            storage=storage,
            generator=generator,
            verifier=verifier,
            course_id=course_id,
            case_study_id=case_study_id,
            seed=secrets.randbits(_SEED_BITS),
        )
        if state == VERIFIED:
            generated += 1
        elif state == "flagged":
            flagged += 1
        elif state in ("no_spec",):
            break

    return {
        "attempts": attempts,
        "generated": generated,
        "flagged": flagged,
        "budget_exhausted": int(budget_exhausted),
    }
