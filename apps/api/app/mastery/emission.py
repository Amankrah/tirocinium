"""Evidence emission (backend guide 6.6, mastery spec section 3, milestone
6.2). After a submission is processed, two automatic evidence sources fire:

- `answer_match`: the Rust comparer checks the variant's stored final answers
  against the student's transcription. Score 1.0 on a match, 0.0 on a clear
  mismatch, and no event at all when there is nothing comparable (an
  essay-style case, or a reading with no numbers). Confidence is the
  transcription confidence of the region containing the answer.
- `working_assessment`: the vision pass reads the full transcription against
  the reference solution, essential figures attached as images, and scores
  each mapped concept on the anchored 0 to 3 rubric. Confidence is the
  product of overall transcription confidence and the model's own.

Everything is recorded through the mastery store inside one writer
transaction (event log and state cache move together or not at all, milestone
6.1's hardening), and the whole emission is idempotent: a retried job that
finds this submission's automatic events already present emits nothing.
"""

import asyncio
import json
import sqlite3
import time
from typing import cast

from platform_core import compare as _compare

from app.compression import decompress_text
from app.db.shards import ShardManager
from app.mastery.model import (
    DEFAULT_ASSESSMENT_MODEL,
    WorkingAssessor,
    assessment_document,
)
from app.params.figure_check import load_essential_figures
from app.prompts import load_prompt
from app.storage import IMPORTS_BUCKET, ObjectStorage, fetch_bytes
from mastery_store import MasteryStore

# The comparer's tolerances for reading a student's final answer: the same
# conservative pair the verification loop uses (decision 0038).
REL_TOL = 5e-3
ABS_TOL = 1e-9

RUBRIC_MAX = 3


async def emit_submission_evidence(
    *,
    shards: ShardManager,
    storage: ObjectStorage,
    assessor: WorkingAssessor,
    course_id: int,
    submission_id: int,
    params_json: str | None = None,
    at: int | None = None,
    assessment_model: str = DEFAULT_ASSESSMENT_MODEL,
) -> dict[str, int]:
    """Emit the automatic evidence for one processed submission. Returns the
    per-source event counts (zeros when there was nothing to emit)."""
    at = int(at if at is not None else time.time())

    def load(conn: sqlite3.Connection) -> dict[str, object] | None:
        already = conn.execute(
            "SELECT 1 FROM evidence_events"
            " WHERE ref_kind = 'submission' AND ref_id = ?"
            "   AND source IN ('answer_match', 'working_assessment')",
            (submission_id,),
        ).fetchone()
        if already is not None:
            return None
        row = conn.execute(
            "SELECT seat_id, variant_id, recognized_z, recognition_conf"
            " FROM submissions WHERE id = ? AND status = 'processed'",
            (submission_id,),
        ).fetchone()
        if row is None or row[2] is None:
            return None
        variant = conn.execute(
            "SELECT case_study_id, solution_z FROM variants WHERE id = ?",
            (int(row[1]),),
        ).fetchone()
        if variant is None:
            return None
        case_study_id = int(variant[0])
        mappings = conn.execute(
            "SELECT csc.concept_id, csc.weight, c.name, c.description"
            " FROM case_study_concepts csc JOIN concepts c ON c.id = csc.concept_id"
            " WHERE csc.case_study_id = ?",
            (case_study_id,),
        ).fetchall()
        if not mappings:
            return None
        regions = conn.execute(
            "SELECT pt.confidence, pt.regions_json"
            " FROM submission_pages sp"
            " JOIN page_transcriptions pt ON sp.content_sha = pt.content_hash"
            " WHERE sp.submission_id = ? ORDER BY sp.page_index",
            (submission_id,),
        ).fetchall()
        return {
            "seat_id": int(row[0]),
            "case_study_id": case_study_id,
            "transcription": decompress_text(conn, "handwriting", bytes(row[2])),
            "overall_conf": float(row[3] or 0.0),
            "solution_blob": decompress_text(conn, "problem_text", bytes(variant[1])),
            "mappings": [
                (int(m[0]), float(m[1]), str(m[2]), None if m[3] is None else str(m[3]))
                for m in mappings
            ],
            "regions": [
                (float(r[0] or 0.0), str(r[1] or "[]")) for r in regions
            ],
        }

    loaded = await shards.course_reads(course_id).run(load)
    if loaded is None:
        return {"answer_match": 0, "working_assessment": 0}

    transcription = str(loaded["transcription"])
    overall_conf = cast(float, loaded["overall_conf"])
    mappings = cast(list[tuple[int, float, str, str | None]], loaded["mappings"])

    solution_md, final_answers = _solution_parts(str(loaded["solution_blob"]))

    # ---------------------------------------------------------- answer_match
    match_score: float | None = None
    match_confidence = 0.0
    if final_answers:
        verdict = _compare.answers_in_text(
            final_answers, transcription, REL_TOL, ABS_TOL
        )
        if verdict == "match":
            match_score = 1.0
        elif verdict == "mismatch":
            match_score = 0.0
        if match_score is not None:
            match_confidence = _answer_region_confidence(
                final_answers,
                cast(list[tuple[float, str]], loaded["regions"]),
                overall_conf,
            )

    # --------------------------------------------------- working_assessment
    concepts_for_doc = [
        (concept_id, name, description)
        for concept_id, _weight, name, description in mappings
    ]
    document = assessment_document(transcription, solution_md, concepts_for_doc)
    figures = await shards.course_reads(course_id).run(
        load_essential_figures(cast(int, loaded["case_study_id"]))
    )
    images = [
        await asyncio.to_thread(
            fetch_bytes, storage, IMPORTS_BUCKET, figure.storage_key
        )
        for figure in figures
    ]
    prompt = load_prompt("working-assessment", "v1")
    assessment = await assessor.assess(
        document, images, prompt.text, model_id=assessment_model
    )
    # A concept the model named but the case does not map is dropped, like a
    # hallucinated figure id in segmentation.
    weights = {concept_id: weight for concept_id, weight, _n, _d in mappings}
    rubric_scores = {
        score.concept_id: score.rubric
        for score in assessment.concepts
        if score.concept_id in weights
    }
    assessment_confidence = max(0.0, overall_conf * assessment.confidence)

    seat_id = cast(int, loaded["seat_id"])
    counts = {"answer_match": 0, "working_assessment": 0}

    def record(conn: sqlite3.Connection) -> None:
        store = MasteryStore(conn, params_json=params_json)
        for concept_id, weight, _name, _description in mappings:
            if match_score is not None:
                store.record_event(
                    seat_id=seat_id,
                    concept_id=concept_id,
                    source="answer_match",
                    score=match_score,
                    confidence=match_confidence,
                    k=weight,
                    ref_kind="submission",
                    ref_id=submission_id,
                    at=at,
                )
                counts["answer_match"] += 1
            if concept_id in rubric_scores:
                store.record_event(
                    seat_id=seat_id,
                    concept_id=concept_id,
                    source="working_assessment",
                    score=rubric_scores[concept_id] / RUBRIC_MAX,
                    confidence=assessment_confidence,
                    k=weight,
                    ref_kind="submission",
                    ref_id=submission_id,
                    at=at,
                )
                counts["working_assessment"] += 1

    await shards.course(course_id).run(record)
    return counts


def _solution_parts(solution_blob: str) -> tuple[str, list[str]]:
    """A variant's stored solution is JSON with solution_md and final_answers
    (decision 0038); older fixture rows hold plain text, which simply has no
    comparable answers."""
    try:
        data = json.loads(solution_blob)
    except ValueError:
        return solution_blob, []
    if not isinstance(data, dict):
        return solution_blob, []
    return (
        str(data.get("solution_md", "")),
        [str(answer) for answer in data.get("final_answers", [])],
    )


def _answer_region_confidence(
    answers: list[str], regions: list[tuple[float, str]], overall: float
) -> float:
    """The transcription confidence of the region containing the answer
    (spec section 3), floored at 0. The region whose text the comparer finds
    the answers in wins; when no single region contains them (an answer split
    across regions, or no region data), the submission's overall confidence
    stands in."""
    for page_confidence, regions_json in regions:
        del page_confidence
        try:
            parsed = json.loads(regions_json)
        except ValueError:
            continue
        for region in parsed:
            text = str(region.get("text", ""))
            verdict = _compare.answers_in_text(answers, text, REL_TOL, ABS_TOL)
            if verdict == "match":
                return max(0.0, float(region.get("confidence", overall)))
    return max(0.0, overall)
