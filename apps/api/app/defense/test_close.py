"""Milestone 7.3: the closing rubric, the transcript, and the accounting.

The gate's rubric contract is the first test here: malformed tutor output is
rejected and retried, never ingested. The rest is what the guide requires a
closed session to leave behind: one defense_rubric evidence event per concept
actually discussed and mapped, scored on the anchored scale with the tutor's own
session confidence, the compressed transcript, the named concept to revisit, and
the token and speech spend per course. What it must not leave behind is audio.
"""

import json
import sqlite3
from pathlib import Path

import pytest

from app.compression import decompress_text
from app.db.shards import ShardManager
from app.defense.close import (
    SessionUsage,
    SpeechSpend,
    close_conversation,
    record_usage,
)
from app.defense.conftest import (
    FIGURE_BYTES,
    VALID_RUBRIC,
    FakeStorage,
    build_context,
    evidence,
)
from app.defense.model import RecordedTutor, TokenUsage, Turn

DAY = 86_400

TURNS = [
    Turn(role="student", text="I used Ohm's law.", at=DAY),
    Turn(role="tutor", text="Why does that hold here?", at=DAY),
    Turn(role="student", text="Because the loop current is common.", at=DAY),
]


async def test_a_valid_verdict_becomes_evidence_and_a_stored_transcript(
    tmp_path: Path,
) -> None:
    storage = FakeStorage()
    async with ShardManager(tmp_path) as shards:
        context = await build_context(shards, storage)
        tutor = RecordedTutor(rubrics=[VALID_RUBRIC])

        closed = await close_conversation(
            shards=shards,
            tutor=tutor,
            course_id=1,
            context=context,
            turns=TURNS,
            at=DAY,
        )

        def read(conn: sqlite3.Connection) -> tuple[list[object], str, int]:
            row = conn.execute(
                "SELECT status, transcript_z, rubric_json, concept_to_revisit,"
                " turn_count, closed_at FROM conversations WHERE id = ?",
                (context.conversation_id,),
            ).fetchone()
            return (
                list(row),
                decompress_text(conn, "handwriting", bytes(row[1])),
                len(evidence(conn)),
            )

        row, transcript, _count = await shards.course_reads(1).run(read)
        rows = await shards.course_reads(1).run(evidence)
        states = await shards.course_reads(1).run(
            lambda conn: conn.execute(
                "SELECT COUNT(*) FROM mastery_state"
            ).fetchone()[0]
        )

    assert closed.rubric is not None
    assert closed.attempts == 1
    # One event per discussed-and-mapped concept: score is reasoning/3,
    # confidence is the tutor's session confidence, k is the mapping weight.
    assert rows == [
        ("defense_rubric", 7, pytest.approx(2 / 3), 0.9, 1.0),
        ("defense_rubric", 8, 1.0, 0.9, 0.3),
    ]
    # The event log and the state cache moved together (6.1's transaction).
    assert states == 2
    assert row[0] == "closed"
    assert json.loads(str(row[2]))["concept_to_revisit"] == 7
    assert row[3] == 7
    assert row[4] == 2  # student turns
    assert row[5] == DAY
    # The transcript is text, compressed at rest like every other body.
    assert json.loads(transcript) == [turn.model_dump() for turn in TURNS]


async def test_a_malformed_verdict_is_retried_and_the_good_one_ingested(
    tmp_path: Path,
) -> None:
    storage = FakeStorage()
    async with ShardManager(tmp_path) as shards:
        context = await build_context(shards, storage)
        tutor = RecordedTutor(rubrics=["I think they did quite well!", VALID_RUBRIC])

        closed = await close_conversation(
            shards=shards,
            tutor=tutor,
            course_id=1,
            context=context,
            turns=TURNS,
            at=DAY,
        )

        rows = await shards.course_reads(1).run(evidence)

    assert closed.attempts == 2
    assert closed.rubric is not None
    assert len(rows) == 2


async def test_a_verdict_that_never_validates_is_never_ingested(
    tmp_path: Path,
) -> None:
    """The gate's rubric contract. A conversation closes with no rubric rather
    than with a corrupt one: no evidence, no stored verdict, and the transcript
    still kept, because the student's session was real either way."""
    storage = FakeStorage()
    async with ShardManager(tmp_path) as shards:
        context = await build_context(shards, storage)
        tutor = RecordedTutor(
            rubrics=[
                "Sorry, here is my verdict in prose.",
                json.dumps({"concepts": [], "session_confidence": 4.2}),
            ]
        )

        closed = await close_conversation(
            shards=shards,
            tutor=tutor,
            course_id=1,
            context=context,
            turns=TURNS,
            at=DAY,
        )

        rows = await shards.course_reads(1).run(evidence)
        row = await shards.course_reads(1).run(
            lambda conn: conn.execute(
                "SELECT status, rubric_json, concept_to_revisit, transcript_z"
                " FROM conversations WHERE id = ?",
                (context.conversation_id,),
            ).fetchone()
        )

    assert closed.rubric is None
    assert closed.attempts == 2
    assert rows == []
    assert row[0] == "closed"
    assert row[1] is None
    assert row[2] is None
    assert row[3] is not None


async def test_a_concept_the_case_does_not_map_is_dropped(tmp_path: Path) -> None:
    """A hallucinated concept id is dropped, as everywhere else on the
    platform; the mapped ones still count."""
    storage = FakeStorage()
    async with ShardManager(tmp_path) as shards:
        context = await build_context(shards, storage)
        tutor = RecordedTutor(
            rubrics=[
                json.dumps(
                    {
                        "concepts": [
                            {"concept_id": 7, "reasoning": 3, "gap": None},
                            {"concept_id": 999, "reasoning": 0, "gap": "invented"},
                        ],
                        "concept_to_revisit": 7,
                        "session_confidence": 0.8,
                    }
                )
            ]
        )

        await close_conversation(
            shards=shards,
            tutor=tutor,
            course_id=1,
            context=context,
            turns=TURNS,
            at=DAY,
        )

        rows = await shards.course_reads(1).run(evidence)

    assert [row[1] for row in rows] == [7]


async def test_a_session_with_no_student_turns_asks_for_no_verdict(
    tmp_path: Path,
) -> None:
    storage = FakeStorage()
    async with ShardManager(tmp_path) as shards:
        context = await build_context(shards, storage)
        tutor = RecordedTutor(rubrics=[])

        closed = await close_conversation(
            shards=shards,
            tutor=tutor,
            course_id=1,
            context=context,
            turns=[],
            at=DAY,
        )

        rows = await shards.course_reads(1).run(evidence)

    assert closed.rubric is None
    assert closed.attempts == 0
    assert tutor.rubric_calls == 0
    assert rows == []


async def test_the_rubric_call_sees_the_figures_and_the_pinned_model(
    tmp_path: Path,
) -> None:
    """The rubric judges reasoning about a diagram, so it gets the diagram; and
    it runs on the pinned model id it was given, never a floating alias."""
    storage = FakeStorage()
    seen: list[str] = []

    class Recording(RecordedTutor):
        async def close_rubric(
            self,
            system: str,
            turns: list[Turn],
            rubric_prompt: str,
            *,
            figures: list[bytes],
            model_id: str,
        ) -> str:
            seen.append(model_id)
            self.seen_figures.append(list(figures))
            return await super().close_rubric(
                system, turns, rubric_prompt, figures=figures, model_id=model_id
            )

    async with ShardManager(tmp_path) as shards:
        context = await build_context(shards, storage)
        tutor = Recording(rubrics=[VALID_RUBRIC])

        await close_conversation(
            shards=shards,
            tutor=tutor,
            course_id=1,
            context=context,
            turns=TURNS,
            rubric_model="claude-3-5-sonnet-20241022",
            at=DAY,
        )

    assert seen == ["claude-3-5-sonnet-20241022"]
    assert tutor.seen_figures == [[FIGURE_BYTES]]


async def test_usage_lands_as_tokens_and_speech_quantities(tmp_path: Path) -> None:
    """Speech dominates the cost of a defence, so it is accounted in the
    provider's own unit beside the token rows (guide 6.5)."""
    storage = FakeStorage()
    async with ShardManager(tmp_path) as shards:
        await build_context(shards, storage)

        await shards.course(1).run(
            record_usage(
                SessionUsage(
                    tutor_model="claude-3-5-haiku-latest",
                    tutor=TokenUsage(input_tokens=4100, output_tokens=260),
                    rubric_model="claude-3-5-sonnet-20241022",
                    rubric=TokenUsage(input_tokens=4300, output_tokens=90),
                    stt=SpeechSpend(
                        provider="deepgram-flux", unit="seconds", amount=92.5
                    ),
                    tts=SpeechSpend(
                        provider="cartesia-sonic", unit="characters", amount=1480.0
                    ),
                )
            )
        )

        tokens = await shards.course_reads(1).run(
            lambda conn: [
                (str(r[0]), str(r[1]), int(r[2]), int(r[3]))
                for r in conn.execute(
                    "SELECT kind, model_id, input_tokens, output_tokens"
                    " FROM token_usage ORDER BY kind"
                ).fetchall()
            ]
        )
        speech = await shards.course_reads(1).run(
            lambda conn: [
                (str(r[0]), str(r[1]), str(r[2]), float(r[3]))
                for r in conn.execute(
                    "SELECT kind, provider, unit, amount FROM speech_usage"
                    " ORDER BY kind"
                ).fetchall()
            ]
        )

    assert tokens == [
        ("defense_rubric", "claude-3-5-sonnet-20241022", 4300, 90),
        ("defense_tutor", "claude-3-5-haiku-latest", 4100, 260),
    ]
    assert speech == [
        ("defense_stt", "deepgram-flux", "seconds", 92.5),
        ("defense_tts", "cartesia-sonic", "characters", 1480.0),
    ]


async def test_no_column_anywhere_can_hold_the_audio(tmp_path: Path) -> None:
    """A conversation is ephemeral in its audio by construction, not by
    policy: the schema gives the bytes nowhere to go."""
    async with ShardManager(tmp_path) as shards:
        columns = await shards.course_reads(1).run(
            lambda conn: [
                str(row[1]) for row in conn.execute("PRAGMA table_info(conversations)")
            ]
        )

    assert columns == [
        "id",
        "submission_id",
        "seat_id",
        "status",
        "transcript_z",
        "rubric_json",
        "concept_to_revisit",
        "turn_count",
        "started_at",
        "closed_at",
    ]
    assert not [column for column in columns if "audio" in column]
