"""Milestone 3.4 hybrid-retrieval sanity suite (the Phase 3 gate: "seeded
submissions retrieved by both exact terms and paraphrase"). Three submissions
are seeded and indexed through the recorded embedder, then retrieved two ways:
an exact-term query whose words are in the target's text (the FTS5 arm), and a
paraphrase query that shares no words with any submission (the vector arm).
Reciprocal rank fusion surfaces the same submission at the top in both cases.

The embedding vectors are hand-authored so the finance submission is the clear
nearest neighbour of both query vectors, while its text shares words only with
the exact query, never the paraphrase, so each retrieval path is exercised in
isolation and then fused."""

import sqlite3
from collections.abc import Callable
from pathlib import Path

from app.compression import compress_text
from app.db.shards import ShardManager
from app.retrieval.indexing import index_submission
from app.retrieval.model import RecordedEmbedder
from app.retrieval.search import _rrf_fuse, hybrid_search

# Recognized texts, one per topic direction. Only FINANCE shares words with the
# exact query; none share words with the paraphrase.
FINANCE = "the annuity approach discounts each future payment to present value"
NEWTON = "newton iteration converges quadratically near a simple root"
EIGEN = "the eigenvalues of the jacobian determine local stability"

# Query texts. The exact query's words are in FINANCE; the paraphrase's are in
# no submission at all, so only the vector arm can retrieve on it.
EXACT_QUERY = "annuity discount"
PARAPHRASE_QUERY = "pension instalment stream valuation"

# Near-orthogonal topic vectors; both query vectors point mostly at finance.
VECTORS = {
    FINANCE: [1.0, 0.0, 0.0, 0.0],
    NEWTON: [0.0, 1.0, 0.0, 0.0],
    EIGEN: [0.0, 0.0, 1.0, 0.0],
    EXACT_QUERY: [0.9, 0.1, 0.0, 0.0],
    PARAPHRASE_QUERY: [0.9, 0.0, 0.1, 0.0],
}


def _seed(conn: sqlite3.Connection, recognized: str) -> int:
    case_study = conn.execute(
        "INSERT INTO case_studies (author_id, title, body_z, status, created_at,"
        " updated_at) VALUES (1, 't', ?, 'draft', 0, 0)",
        (compress_text(conn, "problem_text", "# t"),),
    )
    variant = conn.execute(
        "INSERT INTO variants (case_study_id, seed_json_z, body_z, solution_z,"
        " verification, model_id, created_at) VALUES (?, ?, ?, ?, 'verified', 'm', 0)",
        (
            case_study.lastrowid,
            compress_text(conn, "problem_text", "{}"),
            compress_text(conn, "problem_text", "b"),
            compress_text(conn, "problem_text", "s"),
        ),
    )
    submission = conn.execute(
        "INSERT INTO submissions (variant_id, seat_id, page_count, storage_prefix,"
        " recognized_z, recognition_conf, status, submitted_at)"
        " VALUES (?, 1, 1, 'p', ?, 0.9, 'processed', 0)",
        (variant.lastrowid, compress_text(conn, "handwriting", recognized)),
    )
    assert submission.lastrowid is not None
    return int(submission.lastrowid)


def _seed_cb(text: str) -> Callable[[sqlite3.Connection], int]:
    def cb(conn: sqlite3.Connection) -> int:
        return _seed(conn, text)

    return cb


async def _seed_indexed_course(tmp_path: Path) -> tuple[ShardManager, dict[str, int]]:
    shards = ShardManager(tmp_path)
    await shards.__aenter__()
    embedder = RecordedEmbedder.for_texts(VECTORS)
    ids: dict[str, int] = {}
    for text in (FINANCE, NEWTON, EIGEN):
        submission_id = await shards.course(1).run(_seed_cb(text))
        await index_submission(
            shards=shards, embedder=embedder, course_id=1, submission_id=submission_id
        )
        ids[text] = submission_id
    return shards, ids


def test_rrf_fuse_combines_rankings() -> None:
    # id 1 is top of the first ranking and second of the second; it should win
    # the fusion over ids that top only one ranking.
    fused = _rrf_fuse([[1, 2, 3], [3, 1, 2]])
    order = [ref_id for ref_id, _ in fused]
    assert order == [1, 3, 2]
    # Every fused score is a sum of two reciprocal-rank contributions.
    assert fused[0][1] == 1.0 / 61 + 1.0 / 62


async def test_exact_terms_retrieve_the_submission(tmp_path: Path) -> None:
    shards, ids = await _seed_indexed_course(tmp_path)
    try:
        embedder = RecordedEmbedder.for_texts(VECTORS)
        results = await hybrid_search(
            shards=shards, embedder=embedder, course_id=1, query=EXACT_QUERY, limit=5
        )
    finally:
        shards.close()

    assert results.hits, "expected at least one hit"
    top = results.hits[0]
    assert top.submission_id == ids[FINANCE]
    assert top.status == "processed"
    assert "annuity" in top.snippet


async def test_paraphrase_retrieves_the_submission(tmp_path: Path) -> None:
    shards, ids = await _seed_indexed_course(tmp_path)
    try:
        embedder = RecordedEmbedder.for_texts(VECTORS)
        results = await hybrid_search(
            shards=shards, embedder=embedder, course_id=1, query=PARAPHRASE_QUERY, limit=5
        )
    finally:
        shards.close()

    # The paraphrase shares no words with any submission, so the FTS5 arm finds
    # nothing; retrieval here is the vector arm's doing, and it still puts the
    # finance submission on top.
    assert results.hits
    assert results.hits[0].submission_id == ids[FINANCE]


async def test_search_over_an_empty_course_returns_no_hits(tmp_path: Path) -> None:
    async with ShardManager(tmp_path) as shards:
        embedder = RecordedEmbedder.for_texts(VECTORS)
        results = await hybrid_search(
            shards=shards, embedder=embedder, course_id=1, query=EXACT_QUERY, limit=5
        )
    assert results.hits == []
    assert results.query == EXACT_QUERY
