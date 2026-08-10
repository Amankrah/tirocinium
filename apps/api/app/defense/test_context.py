"""Milestone 7.1: session context assembly. The tutor gets exactly the three
things guide 6.5 names (the variant, the professor's reference solution, the
student's own transcription), the essential figures as pixels, and the mapped
concepts by id so the closing rubric can score them. Nothing about the student
beyond the seat context is in the prompt, and figure bytes are never in it.
"""

import sqlite3
from pathlib import Path

from app.db.shards import ShardManager
from app.defense.conftest import (
    FIGURE_BYTES,
    FIGURE_KEY,
    REFERENCE_SOLUTION,
    TRANSCRIPTION,
    VARIANT_BODY,
    FakeStorage,
    open_conversation_row,
    seed_defensible_submission,
)
from app.defense.context import assemble_context
from app.storage import IMPORTS_BUCKET


async def test_context_carries_the_three_sources_and_figures_as_pixels(
    tmp_path: Path,
) -> None:
    storage = FakeStorage()
    storage.objects[(IMPORTS_BUCKET, FIGURE_KEY)] = FIGURE_BYTES
    async with ShardManager(tmp_path) as shards:
        submission_id = await shards.course(1).run(seed_defensible_submission)
        conversation_id = await shards.course(1).run(
            open_conversation_row(submission_id)
        )

        context = await assemble_context(
            shards=shards,
            storage=storage,
            course_id=1,
            conversation_id=conversation_id,
            submission_id=submission_id,
        )

    assert context is not None
    # The three sources, each as delimited untrusted content.
    assert VARIANT_BODY in context.system
    assert REFERENCE_SOLUTION in context.system
    assert TRANSCRIPTION in context.system
    assert context.system.count("<<<content") == 3
    # The mapped concepts travel by id, which is what the rubric scores.
    assert "- id 7: Ohm" in context.system
    assert "- id 8: Power" in context.system
    assert context.concepts == [(7, "Ohm"), (8, "Power")]
    # The figure is pixels, byte for byte, and it is not in the text.
    assert context.figures == [FIGURE_BYTES]
    assert "PNG" not in context.system
    assert FIGURE_KEY not in context.system
    # The reference solution is numbered in the unfold's numbering (8.4), and
    # a seat that has unfolded nothing is stated as such, so the tutor knows
    # exactly which steps it must not volunteer.
    assert "[step 1]" in context.system
    assert "unfolded none of the 1 steps" in context.system
    # Provenance: the versioned prompt id, stored with the session.
    assert context.prompt_version.startswith("defense-tutor/v2")


async def test_the_prompt_carries_no_student_identity(tmp_path: Path) -> None:
    """A seat is the whole identity, and even that is not in the prompt: the
    seat id travels beside the context because evidence needs it, never inside
    the text sent to the provider."""
    storage = FakeStorage()
    storage.objects[(IMPORTS_BUCKET, FIGURE_KEY)] = FIGURE_BYTES
    async with ShardManager(tmp_path) as shards:
        submission_id = await shards.course(1).run(
            lambda conn: seed_defensible_submission(conn, seat_id=4242)
        )
        conversation_id = await shards.course(1).run(
            open_conversation_row(submission_id, seat_id=4242)
        )

        context = await assemble_context(
            shards=shards,
            storage=storage,
            course_id=1,
            conversation_id=conversation_id,
            submission_id=submission_id,
        )

    assert context is not None
    assert context.seat_id == 4242
    assert "4242" not in context.system


async def test_an_unprocessed_submission_has_no_context(tmp_path: Path) -> None:
    """Nothing to defend until the transcription exists, so assembly refuses
    rather than inventing a conversation about an empty reading."""
    storage = FakeStorage()
    async with ShardManager(tmp_path) as shards:
        submission_id = await shards.course(1).run(
            lambda conn: seed_defensible_submission(conn, status="processing")
        )

        context = await assemble_context(
            shards=shards,
            storage=storage,
            course_id=1,
            conversation_id=1,
            submission_id=submission_id,
        )

    assert context is None


async def test_a_decorative_figure_is_not_attached(tmp_path: Path) -> None:
    """The essential/decorative split is the same one the frozen check honours:
    a figure the professor marked decorative is not part of the defence's
    context, so the tutor is never asked to reason about a rule or a logo."""
    storage = FakeStorage()
    storage.objects[(IMPORTS_BUCKET, FIGURE_KEY)] = FIGURE_BYTES
    async with ShardManager(tmp_path) as shards:
        submission_id = await shards.course(1).run(seed_defensible_submission)

        def make_decorative(conn: sqlite3.Connection) -> None:
            conn.execute("UPDATE item_figures SET role = 'decorative'")

        await shards.course(1).run(make_decorative)

        context = await assemble_context(
            shards=shards,
            storage=storage,
            course_id=1,
            conversation_id=1,
            submission_id=submission_id,
        )

    assert context is not None
    assert context.figures == []
