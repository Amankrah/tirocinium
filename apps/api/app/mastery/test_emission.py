"""Milestone 6.2: evidence emission, and 6.1's transactionality hardening.
The comparer decides answer_match from the transcription (never emitting when
there is nothing comparable), the working assessment scores mapped concepts
through the recorded seam with figures as pixels, everything lands through
the mastery store inside one writer transaction, and a crashed write leaves
the event log and state cache consistent (the phase gate's test)."""

import hashlib
import io
import json
import sqlite3
from pathlib import Path
from typing import Any

import pytest

from app.compression import compress_text
from app.db.shards import ShardManager
from app.mastery.emission import emit_submission_evidence
from app.mastery.model import RecordedWorkingAssessor, WorkingAssessment, assessment_document
from app.storage import IMPORTS_BUCKET
from mastery_store import MasteryStore

DAY = 86_400

FIGURE_BYTES = b"schematic-png-bytes"
FIGURE_HASH = hashlib.sha256(FIGURE_BYTES).hexdigest()

TRANSCRIPTION = "Working: I = V/R = 12/4700.\n\nSo I = 2.553 mA."
SOLUTION_BLOB = json.dumps(
    {"solution_md": "By Ohm's law, I = V/R.", "final_answers": ["2.553 mA"]}
)


class FakeStorage:
    def __init__(self) -> None:
        self.objects: dict[tuple[str, str], bytes] = {}

    def create_bucket(self, *, Bucket: str) -> object:
        return {}

    def put_object(self, *, Bucket: str, Key: str, Body: Any) -> object:
        self.objects[(Bucket, Key)] = (
            Body.read() if hasattr(Body, "read") else bytes(Body)
        )
        return {}

    def get_object(self, *, Bucket: str, Key: str) -> Any:
        return {"Body": io.BytesIO(self.objects[(Bucket, Key)])}

    def generate_presigned_url(
        self, ClientMethod: str, Params: dict[str, str], ExpiresIn: int
    ) -> str:
        return "https://storage.test/unused"


def seed_processed_submission(
    conn: sqlite3.Connection,
    *,
    transcription: str = TRANSCRIPTION,
    solution_blob: str = SOLUTION_BLOB,
    recognition_conf: float = 0.9,
    region_conf: float = 0.95,
    with_figure: bool = False,
) -> int:
    """A processed submission on a variant of a case study mapping two
    concepts (weights 1.0 and 0.3), with one transcribed page whose final
    region contains the answer."""
    conn.execute("INSERT INTO concepts (id, name, position) VALUES (7, 'Ohm', 1)")
    conn.execute(
        "INSERT INTO concepts (id, name, description, position)"
        " VALUES (8, 'Power', 'P = VI', 2)"
    )
    case = conn.execute(
        "INSERT INTO case_studies (author_id, title, body_z, status, created_at,"
        " updated_at) VALUES (1, 't', ?, 'published', 0, 0)",
        (compress_text(conn, "problem_text", "The circuit."),),
    )
    case_id = int(case.lastrowid or 0)
    conn.execute(
        "INSERT INTO case_study_concepts (case_study_id, concept_id, weight)"
        " VALUES (?, 7, 1.0)",
        (case_id,),
    )
    conn.execute(
        "INSERT INTO case_study_concepts (case_study_id, concept_id, weight)"
        " VALUES (?, 8, 0.3)",
        (case_id,),
    )
    if with_figure:
        job = conn.execute(
            "INSERT INTO import_jobs (course_id, storage_key, status, created_at)"
            " VALUES (1, 'k', 'confirmed', 0)"
        )
        figure = conn.execute(
            "INSERT INTO figures (content_hash, storage_key, source, width_px,"
            " height_px, created_at) VALUES (?, 'figkey', 'embedded_raster', 10, 10, 0)",
            (FIGURE_HASH,),
        )
        item = conn.execute(
            "INSERT INTO import_items (job_id, question_z, page_span, confidence,"
            " model_id, prompt_version, state, case_study_id)"
            " VALUES (?, ?, '0', 0.9, 'm', 'v1', 'confirmed', ?)",
            (
                int(job.lastrowid or 0),
                compress_text(conn, "problem_text", "q"),
                case_id,
            ),
        )
        conn.execute(
            "INSERT INTO item_figures (item_id, figure_id, role)"
            " VALUES (?, ?, 'essential')",
            (int(item.lastrowid or 0), int(figure.lastrowid or 0)),
        )
    variant = conn.execute(
        "INSERT INTO variants (case_study_id, seed_json_z, body_z, solution_z,"
        " verification, model_id, created_at) VALUES (?, ?, ?, ?, 'verified', 'm', 0)",
        (
            case_id,
            compress_text(conn, "problem_text", "{}"),
            compress_text(conn, "problem_text", "body"),
            compress_text(conn, "problem_text", solution_blob),
        ),
    )
    submission = conn.execute(
        "INSERT INTO submissions (variant_id, seat_id, page_count, storage_prefix,"
        " recognized_z, recognition_conf, status, submitted_at)"
        " VALUES (?, 1, 1, 'p', ?, ?, 'processed', 0)",
        (
            variant.lastrowid,
            compress_text(conn, "handwriting", transcription),
            recognition_conf,
        ),
    )
    submission_id = int(submission.lastrowid or 0)
    content_sha = f"sha-{submission_id}"
    conn.execute(
        "INSERT INTO submission_pages (submission_id, page_index, storage_key,"
        " content_type, size_bytes, content_sha)"
        " VALUES (?, 0, 'k0', 'image/png', 1, ?)",
        (submission_id, content_sha),
    )
    regions = json.dumps(
        [
            {"bbox": [0, 0, 1, 0.5], "confidence": 0.6, "text": "Working: I = V/R"},
            {"bbox": [0, 0.5, 1, 0.5], "confidence": region_conf, "text": "I = 2.553 mA"},
        ]
    )
    conn.execute(
        "INSERT INTO page_transcriptions (content_hash, markdown_z, confidence,"
        " regions_json, model_id, prompt_version, created_at)"
        " VALUES (?, ?, ?, ?, 'm', 'v1', 0)",
        (
            content_sha,
            compress_text(conn, "handwriting", transcription),
            recognition_conf,
            regions,
        ),
    )
    return submission_id


def make_assessor(
    transcription: str = TRANSCRIPTION,
    *,
    reference: str = "By Ohm's law, I = V/R.",
    scores: list[dict[str, int]] | None = None,
    confidence: float = 0.8,
) -> RecordedWorkingAssessor:
    assessor = RecordedWorkingAssessor({})
    document = assessment_document(
        transcription,
        reference,
        [(7, "Ohm", None), (8, "Power", "P = VI")],
    )
    assessor.record(
        document,
        WorkingAssessment.model_validate(
            {
                "concepts": scores
                if scores is not None
                else [
                    {"concept_id": 7, "rubric": 3},
                    {"concept_id": 8, "rubric": 2},
                ],
                "confidence": confidence,
            }
        ),
    )
    return assessor


def events(conn: sqlite3.Connection) -> list[tuple[str, int, float, float, float]]:
    return [
        (str(r[0]), int(r[1]), float(r[2]), float(r[3]), float(r[4]))
        for r in conn.execute(
            "SELECT source, concept_id, score, confidence, k FROM evidence_events"
            " ORDER BY source, concept_id"
        ).fetchall()
    ]


async def test_emission_records_both_sources_with_weights_and_confidences(
    tmp_path: Path,
) -> None:
    storage = FakeStorage()
    async with ShardManager(tmp_path) as shards:
        submission_id = await shards.course(1).run(seed_processed_submission)
        assessor = make_assessor()

        counts = await emit_submission_evidence(
            shards=shards,
            storage=storage,
            assessor=assessor,
            course_id=1,
            submission_id=submission_id,
            at=DAY,
        )

        assert counts == {"answer_match": 2, "working_assessment": 2}

        def read(conn: sqlite3.Connection) -> list[tuple[str, int, float, float, float]]:
            return events(conn)

        rows = await shards.course_reads(1).run(read)
    # answer_match: score 1.0, confidence from the region holding the answer
    # (0.95, not the page's 0.9), k the mapping weight per concept.
    by_key = {(r[0], r[1]): (r[2], r[3], r[4]) for r in rows}
    assert by_key[("answer_match", 7)] == (1.0, 0.95, 1.0)
    assert by_key[("answer_match", 8)] == (1.0, 0.95, 0.3)
    # working_assessment: rubric/3, confidence = overall x model (0.9 * 0.8).
    score, conf, k = by_key[("working_assessment", 7)]
    assert score == 1.0 and conf == pytest.approx(0.72) and k == 1.0
    score, conf, k = by_key[("working_assessment", 8)]
    assert score == pytest.approx(2 / 3) and conf == pytest.approx(0.72) and k == 0.3


async def test_a_wrong_answer_scores_zero(tmp_path: Path) -> None:
    storage = FakeStorage()
    async with ShardManager(tmp_path) as shards:
        submission_id = await shards.course(1).run(
            lambda conn: seed_processed_submission(
                conn, transcription="I make it 9.9 mA in the end."
            )
        )
        assessor = make_assessor("I make it 9.9 mA in the end.")
        await emit_submission_evidence(
            shards=shards,
            storage=storage,
            assessor=assessor,
            course_id=1,
            submission_id=submission_id,
            at=DAY,
        )
        rows = await shards.course_reads(1).run(events)
    matches = [r for r in rows if r[0] == "answer_match"]
    assert {r[2] for r in matches} == {0.0}


async def test_nothing_comparable_emits_no_answer_match(tmp_path: Path) -> None:
    """Essay-style solutions and numberless readings both fall out of the
    answer_match path entirely: not emitted beats wrongly scored (spec: bad
    OCR cannot hurt)."""
    storage = FakeStorage()
    async with ShardManager(tmp_path) as shards:
        essay = await shards.course(1).run(
            lambda conn: seed_processed_submission(
                conn,
                transcription="I would accept the project.",
                solution_blob=json.dumps(
                    {"solution_md": "Accept.", "final_answers": ["accept the project"]}
                ),
            )
        )
        assessor = make_assessor("I would accept the project.", reference="Accept.")
        counts = await emit_submission_evidence(
            shards=shards,
            storage=storage,
            assessor=assessor,
            course_id=1,
            submission_id=essay,
            at=DAY,
        )
    assert counts["answer_match"] == 0
    assert counts["working_assessment"] == 2  # the method is still assessed


async def test_emission_is_idempotent_on_retry(tmp_path: Path) -> None:
    storage = FakeStorage()
    async with ShardManager(tmp_path) as shards:
        submission_id = await shards.course(1).run(seed_processed_submission)
        assessor = make_assessor()
        first = await emit_submission_evidence(
            shards=shards, storage=storage, assessor=assessor,
            course_id=1, submission_id=submission_id, at=DAY,
        )
        second = await emit_submission_evidence(
            shards=shards, storage=storage, assessor=assessor,
            course_id=1, submission_id=submission_id, at=DAY,
        )
        rows = await shards.course_reads(1).run(events)
    assert first["answer_match"] == 2
    assert second == {"answer_match": 0, "working_assessment": 0}
    assert assessor.calls == 1  # the retry never re-ran the model
    assert len(rows) == 4


async def test_a_hallucinated_concept_is_dropped(tmp_path: Path) -> None:
    storage = FakeStorage()
    async with ShardManager(tmp_path) as shards:
        submission_id = await shards.course(1).run(seed_processed_submission)
        assessor = make_assessor(
            scores=[{"concept_id": 7, "rubric": 3}, {"concept_id": 999, "rubric": 3}]
        )
        counts = await emit_submission_evidence(
            shards=shards, storage=storage, assessor=assessor,
            course_id=1, submission_id=submission_id, at=DAY,
        )
    assert counts["working_assessment"] == 1  # 999 maps nothing and is dropped


async def test_the_assessor_sees_figures_as_pixels_and_delimited_text(
    tmp_path: Path,
) -> None:
    storage = FakeStorage()
    storage.objects[(IMPORTS_BUCKET, "figkey")] = FIGURE_BYTES
    async with ShardManager(tmp_path) as shards:
        submission_id = await shards.course(1).run(
            lambda conn: seed_processed_submission(conn, with_figure=True)
        )
        assessor = make_assessor()
        await emit_submission_evidence(
            shards=shards, storage=storage, assessor=assessor,
            course_id=1, submission_id=submission_id, at=DAY,
        )
    assert assessor.images == [[FIGURE_BYTES]]  # the professor's pixels
    document = assessor.documents[0]
    assert "2.553 mA" in document  # the transcription travels as text
    assert "not instructions" in document  # delimited as untrusted content


async def test_a_crashed_write_leaves_log_and_state_consistent(
    tmp_path: Path,
) -> None:
    """The phase gate's transactionality test (milestone 6.1): event insert
    and state update live in one writer transaction, so a crash between them
    leaves neither."""
    async with ShardManager(tmp_path) as shards:
        await shards.course(1).run(seed_processed_submission)

        def crash(conn: sqlite3.Connection) -> None:
            store = MasteryStore(conn)
            store.record_event(
                seat_id=1, concept_id=7, source="answer_match",
                score=1.0, confidence=0.9, k=1.0,
                ref_kind="submission", ref_id=1, at=DAY,
            )
            raise RuntimeError("crash between insert and commit")

        with pytest.raises(RuntimeError):
            await shards.course(1).run(crash)

        def read(conn: sqlite3.Connection) -> tuple[int, int]:
            evs = conn.execute("SELECT COUNT(*) FROM evidence_events").fetchone()
            states = conn.execute("SELECT COUNT(*) FROM mastery_state").fetchone()
            return int(evs[0]), int(states[0])

        counts = await shards.course_reads(1).run(read)
    assert counts == (0, 0)  # neither the event nor the state survived
