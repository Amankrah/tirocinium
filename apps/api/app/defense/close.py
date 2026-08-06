"""The closing rubric and session persistence (milestone 7.3). When a
conversation ends, the tutor emits its structured verdict on the *pinned*
rubric model; the raw text is validated against the mastery spec's schema and
retried once on a malformed response, and a verdict that never validates is
never ingested (the conversation closes with no rubric rather than with a
corrupt one). A valid rubric becomes one defense_rubric evidence event per
discussed-and-mapped concept (score reasoning/3, confidence the tutor's own
session_confidence, k the mapping weight), recorded through the mastery store
inside the same writer transaction that stores the compressed transcript, so
the log, the cache, and the conversation row move together.

Raw audio was never persisted anywhere; the transcript (text turns) and the
verdict are all that outlives the session. Token usage for the tutor and
rubric calls lands in token_usage; speech seconds and characters land in
speech_usage (guide 6.5: speech dominates the cost, so it is what the
accounting must see).
"""

import json
import sqlite3
import time
from collections.abc import Callable

from pydantic import BaseModel

from app.compression import compress_text
from app.db.shards import ShardManager
from app.defense.context import DefenseContext
from app.defense.model import (
    DEFAULT_RUBRIC_MODEL,
    DefenseRubric,
    TokenUsage,
    Turn,
    Tutor,
    parse_rubric,
)
from app.prompts import load_prompt
from mastery_store import MasteryStore

RUBRIC_ATTEMPTS = 2  # one call, one retry; then close without ingesting

RUBRIC_MAX = 3


class CloseResult(BaseModel, frozen=True):
    """What closing a session produced: the validated verdict (None when none
    survived validation, in which case nothing was ingested), how many rubric
    calls it took, and what those calls spent."""

    rubric: DefenseRubric | None = None
    attempts: int = 0
    rubric_usage: TokenUsage = TokenUsage()


class SpeechSpend(BaseModel, frozen=True):
    """One speech provider's billed quantity for a session. Speech dominates
    the cost of a defence (guide 6.5), so it is accounted separately from
    tokens, in the provider's own unit."""

    provider: str
    unit: str  # 'seconds' (STT audio) | 'characters' (TTS input)
    amount: float


class SessionUsage(BaseModel, frozen=True):
    """Everything one defence spent, per course."""

    tutor_model: str
    tutor: TokenUsage = TokenUsage()
    rubric_model: str | None = None
    rubric: TokenUsage | None = None
    stt: SpeechSpend | None = None
    tts: SpeechSpend | None = None


async def close_conversation(
    *,
    shards: ShardManager,
    tutor: Tutor,
    course_id: int,
    context: DefenseContext,
    turns: list[Turn],
    params_json: str | None = None,
    rubric_model: str = DEFAULT_RUBRIC_MODEL,
    at: int | None = None,
) -> CloseResult:
    """Run the closing rubric and persist the session. A conversation with no
    student turns skips the rubric entirely: there is nothing to judge."""
    at = int(at if at is not None else time.time())
    rubric: DefenseRubric | None = None
    attempts = 0
    before = tutor.usage()
    if any(turn.role == "student" for turn in turns):
        prompt = load_prompt("defense-rubric", "v1")
        for _attempt in range(RUBRIC_ATTEMPTS):
            attempts += 1
            raw = await tutor.close_rubric(
                context.system,
                turns,
                prompt.text,
                figures=context.figures,
                model_id=rubric_model,
            )
            try:
                rubric = parse_rubric(raw)
                break
            except (ValueError, TypeError):
                # Malformed output is rejected and retried, never ingested
                # (the phase gate's rubric contract).
                rubric = None

    mapped = {concept_id for concept_id, _name in context.concepts}
    transcript = json.dumps([turn.model_dump() for turn in turns])

    def persist(conn: sqlite3.Connection) -> None:
        if rubric is not None:
            store = MasteryStore(conn, params_json=params_json)
            weights = {
                int(r[0]): float(r[1])
                for r in conn.execute(
                    "SELECT concept_id, weight FROM case_study_concepts"
                    " WHERE case_study_id = ?",
                    (context.case_study_id,),
                ).fetchall()
            }
            for scored in rubric.concepts:
                # A concept the rubric names but the case does not map is
                # dropped, like every hallucinated id on the platform.
                if scored.concept_id not in mapped or scored.concept_id not in weights:
                    continue
                store.record_event(
                    seat_id=context.seat_id,
                    concept_id=scored.concept_id,
                    source="defense_rubric",
                    score=scored.reasoning / RUBRIC_MAX,
                    confidence=rubric.session_confidence,
                    k=weights[scored.concept_id],
                    ref_kind="conversation",
                    ref_id=context.conversation_id,
                    at=at,
                )
        conn.execute(
            "UPDATE conversations SET status = 'closed', transcript_z = ?,"
            " rubric_json = ?, concept_to_revisit = ?, turn_count = ?,"
            " closed_at = ? WHERE id = ?",
            (
                compress_text(conn, "handwriting", transcript),
                None if rubric is None else rubric.model_dump_json(),
                None if rubric is None else rubric.concept_to_revisit,
                sum(1 for turn in turns if turn.role == "student"),
                at,
                context.conversation_id,
            ),
        )

    await shards.course(course_id).run(persist)
    return CloseResult(
        rubric=rubric,
        attempts=attempts,
        rubric_usage=tutor.usage().minus(before),
    )


def record_usage(usage: SessionUsage) -> Callable[[sqlite3.Connection], None]:
    """Build the accounting writer callable; the route runs it in the shard
    writer, so a session's tokens and speech quantities land in the course's
    own shard beside the 6.4 generation costs."""
    now = int(time.time())

    def apply(conn: sqlite3.Connection) -> None:
        rows = [
            (
                "defense_tutor",
                usage.tutor_model,
                usage.tutor.input_tokens,
                usage.tutor.output_tokens,
            )
        ]
        if usage.rubric is not None:
            rows.append(
                (
                    "defense_rubric",
                    usage.rubric_model or DEFAULT_RUBRIC_MODEL,
                    usage.rubric.input_tokens,
                    usage.rubric.output_tokens,
                )
            )
        conn.executemany(
            "INSERT INTO token_usage"
            " (kind, model_id, input_tokens, output_tokens, created_at)"
            " VALUES (?, ?, ?, ?, ?)",
            [(*row, now) for row in rows],
        )
        speech = [
            ("defense_stt", spend)
            for spend in [usage.stt]
            if spend is not None
        ] + [("defense_tts", spend) for spend in [usage.tts] if spend is not None]
        if speech:
            conn.executemany(
                "INSERT INTO speech_usage (kind, provider, unit, amount, created_at)"
                " VALUES (?, ?, ?, ?, ?)",
                [
                    (kind, spend.provider, spend.unit, spend.amount, now)
                    for kind, spend in speech
                ],
            )

    return apply
