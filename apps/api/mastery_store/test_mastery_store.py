"""End-to-end tests: SQLite adapter -> Rust core, on an in-memory shard
configured with the platform pragmas. These are integration tests; the
model arithmetic itself is property-tested in the Rust crate.
"""

import sqlite3

import pytest

from mastery_store import MasteryStore, migrate

DAY = 86_400


@pytest.fixture()
def store():
    conn = sqlite3.connect(":memory:")
    conn.execute("PRAGMA foreign_keys = ON")
    migrate(conn)
    conn.execute("INSERT INTO concepts (id, name, position) VALUES (7, 'DCF', 1)")
    conn.execute("INSERT INTO concepts (id, name, position) VALUES (8, 'WACC', 2)")
    conn.execute(
        "INSERT INTO case_study_concepts (case_study_id, concept_id, weight) VALUES (1, 7, 1.0)"
    )
    conn.execute(
        "INSERT INTO case_study_concepts (case_study_id, concept_id, weight) VALUES (1, 8, 0.3)"
    )
    yield MasteryStore(conn)
    conn.close()


def test_incremental_matches_replay(store):
    """The cached state after incremental applies equals a fresh replay:
    the adapter-level form of the determinism property."""
    for day in range(7):
        store.record_event(
            seat_id=1, concept_id=7, source="answer_match",
            score=1.0, confidence=0.95, k=1.0,
            ref_kind="submission", ref_id=day, at=day * DAY,
        )
    cached = store._conn.execute(
        "SELECT state_json FROM mastery_state WHERE seat_id=1 AND concept_id=7"
    ).fetchone()[0]
    replayed = store._replay(1, 7)
    assert cached == replayed


def test_daily_practice_reaches_solid(store):
    """The verified trajectory from the crate, through the full stack."""
    view = None
    for day in range(7):
        view = store.record_event(
            seat_id=1, concept_id=7, source="answer_match",
            score=1.0, confidence=0.95, k=1.0,
            ref_kind="submission", ref_id=day, at=day * DAY,
        )
    assert view.label == "solid"


def test_submission_fans_out_with_weights(store):
    views = store.record_submission_evidence(
        seat_id=1, case_study_id=1, submission_id=100,
        source="answer_match", score=1.0, confidence=1.0, at=0,
    )
    by_concept = {v.concept_id: v for v in views}
    assert set(by_concept) == {7, 8}
    # k = 0.3 on the secondary concept means a smaller pull toward the score.
    assert by_concept[8].m_eff < by_concept[7].m_eff


def test_professor_grade_supersedes_misread(store):
    """A blurry scan misread as wrong, then the professor grades it right:
    the automatic event's damage must be erased, not merely outweighed."""
    store.record_event(
        seat_id=1, concept_id=7, source="answer_match",
        score=0.0, confidence=0.9, k=1.0,
        ref_kind="submission", ref_id=500, at=0,
    )
    damaged = store.seat_view(1, now=0)[0].m_eff

    view = store.record_event(
        seat_id=1, concept_id=7, source="professor_grade",
        score=1.0, confidence=1.0, k=1.0,
        ref_kind="grade", ref_id=500, at=DAY,
    )
    assert view.m_eff > damaged

    # And the cached state equals the superseded replay exactly.
    cached = store._conn.execute(
        "SELECT state_json FROM mastery_state WHERE seat_id=1 AND concept_id=7"
    ).fetchone()[0]
    assert cached == store._replay(1, 7)


def test_revisit_queue_orders_most_faded_first(store):
    # Build solid-ish state on two concepts at different times.
    for day in range(7):
        store.record_event(
            seat_id=1, concept_id=7, source="answer_match",
            score=1.0, confidence=0.95, k=1.0,
            ref_kind="submission", ref_id=day, at=day * DAY,
        )
    for day in range(7):
        store.record_event(
            seat_id=1, concept_id=8, source="answer_match",
            score=1.0, confidence=0.95, k=1.0,
            ref_kind="submission", ref_id=100 + day, at=(day + 10) * DAY,
        )
    # Much later, both have faded; concept 7 (older) has lower retention.
    queue = store.revisit_queue(1, now=60 * DAY)
    assert queue == [7, 8]


def test_unseen_concepts_have_no_state_rows(store):
    assert store.seat_view(99) == []
    assert store.revisit_queue(99) == []


def test_check_constraints_reject_bad_events(store):
    with pytest.raises(sqlite3.IntegrityError):
        store.record_event(
            seat_id=1, concept_id=7, source="vibes",
            score=1.0, confidence=1.0, k=1.0,
            ref_kind="submission", ref_id=1, at=0,
        )
    with pytest.raises(sqlite3.IntegrityError):
        store.record_event(
            seat_id=1, concept_id=7, source="answer_match",
            score=1.5, confidence=1.0, k=1.0,
            ref_kind="submission", ref_id=1, at=0,
        )
