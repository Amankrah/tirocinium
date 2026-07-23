"""Milestone 3.4 indexing tests. The Stage 4 step reads a processed
submission's recognized text, inserts it into FTS5, embeds it through the
recorded seam (model calls in tests are recorded, never live), quantizes the
vector in platform_core, and stores the int8 codes with the float32 original
kept for requantization. Covers a successful index, idempotent re-indexing,
skipping a submission with no recognized text, and the course backfill."""

import sqlite3
from pathlib import Path

from app.compression import compress_text
from app.db.shards import ShardManager
from app.retrieval.indexing import backfill_course, index_submission
from app.retrieval.model import DEFAULT_EMBEDDING_MODEL, RecordedEmbedder


def _seed_submission(
    conn: sqlite3.Connection, recognized: str | None, *, status: str = "processed"
) -> int:
    """Insert a case study, a verified variant, and one submission whose
    recognized text is set (or left NULL) directly in the shard."""
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
    recognized_z = (
        None if recognized is None else compress_text(conn, "handwriting", recognized)
    )
    submission = conn.execute(
        "INSERT INTO submissions (variant_id, seat_id, page_count, storage_prefix,"
        " recognized_z, recognition_conf, status, submitted_at)"
        " VALUES (?, 1, 1, 'p', ?, ?, ?, 0)",
        (variant.lastrowid, recognized_z, 0.9 if recognized else None, status),
    )
    submission_id = submission.lastrowid
    assert submission_id is not None
    return int(submission_id)


def _counts(submission_id: int):  # type: ignore[no-untyped-def]
    def read(conn: sqlite3.Connection) -> tuple[int, int]:
        fts = int(
            conn.execute(
                "SELECT COUNT(*) FROM search_fts WHERE kind = 'submission' AND ref_id = ?",
                (submission_id,),
            ).fetchone()[0]
        )
        emb = int(
            conn.execute(
                "SELECT COUNT(*) FROM embeddings WHERE ref_kind = 'submission' AND ref_id = ?",
                (submission_id,),
            ).fetchone()[0]
        )
        return fts, emb

    return read


async def test_index_populates_fts_and_embeddings(tmp_path: Path) -> None:
    text = "the annuity approach discounts each future payment"
    async with ShardManager(tmp_path) as shards:
        submission_id = await shards.course(1).run(lambda c: _seed_submission(c, text))
        embedder = RecordedEmbedder.for_texts({text: [1.0, 0.0, 0.5, 0.0]})

        indexed = await index_submission(
            shards=shards, embedder=embedder, course_id=1, submission_id=submission_id
        )
        assert indexed is True
        assert embedder.calls == 1

        def read(conn: sqlite3.Connection) -> tuple[str, bytes, float, bytes, str]:
            fts = conn.execute(
                "SELECT content FROM search_fts WHERE ref_id = ?", (submission_id,)
            ).fetchone()
            emb = conn.execute(
                "SELECT vec_i8, scale, vec_f32_z, model_id FROM embeddings"
                " WHERE ref_id = ?",
                (submission_id,),
            ).fetchone()
            return str(fts[0]), bytes(emb[0]), float(emb[1]), bytes(emb[2]), str(emb[3])

        content, codes, scale, vec_f32_z, model_id = await shards.course_reads(1).run(read)

    assert "annuity" in content
    assert len(codes) == 4  # one int8 code per component
    assert scale > 0.0
    assert vec_f32_z  # the float32 original is kept for requantization
    assert model_id == DEFAULT_EMBEDDING_MODEL


async def test_reindex_is_idempotent(tmp_path: Path) -> None:
    text = "matrix eigenvalues determine stability"
    async with ShardManager(tmp_path) as shards:
        submission_id = await shards.course(1).run(lambda c: _seed_submission(c, text))
        embedder = RecordedEmbedder.for_texts({text: [0.0, 1.0, 0.0, 0.2]})

        await index_submission(
            shards=shards, embedder=embedder, course_id=1, submission_id=submission_id
        )
        await index_submission(
            shards=shards, embedder=embedder, course_id=1, submission_id=submission_id
        )

        fts, emb = await shards.course_reads(1).run(_counts(submission_id))

    assert fts == 1  # not duplicated on re-index
    assert emb == 1


async def test_index_skips_submission_without_recognized_text(tmp_path: Path) -> None:
    async with ShardManager(tmp_path) as shards:
        submission_id = await shards.course(1).run(
            lambda c: _seed_submission(c, None, status="uploaded")
        )
        embedder = RecordedEmbedder({})  # never consulted

        indexed = await index_submission(
            shards=shards, embedder=embedder, course_id=1, submission_id=submission_id
        )

        fts, emb = await shards.course_reads(1).run(_counts(submission_id))

    assert indexed is False
    assert embedder.calls == 0
    assert fts == 0
    assert emb == 0


async def test_backfill_indexes_every_processed_submission(tmp_path: Path) -> None:
    a = "newton iteration converges quadratically"
    b = "the annuity approach discounts future payments"
    async with ShardManager(tmp_path) as shards:
        id_a = await shards.course(1).run(lambda c: _seed_submission(c, a))
        id_b = await shards.course(1).run(lambda c: _seed_submission(c, b))
        # An unprocessed submission with no recognized text is not indexed.
        await shards.course(1).run(lambda c: _seed_submission(c, None, status="uploaded"))
        embedder = RecordedEmbedder.for_texts(
            {a: [1.0, 0.0, 0.0, 0.0], b: [0.0, 1.0, 0.0, 0.0]}
        )

        indexed = await backfill_course(shards=shards, embedder=embedder, course_id=1)

        def total(conn: sqlite3.Connection) -> tuple[int, int]:
            fts = int(conn.execute("SELECT COUNT(*) FROM search_fts").fetchone()[0])
            emb = int(conn.execute("SELECT COUNT(*) FROM embeddings").fetchone()[0])
            return fts, emb

        fts, emb = await shards.course_reads(1).run(total)

    assert indexed == 2
    assert (fts, emb) == (2, 2)
    assert sorted([id_a, id_b]) == [id_a, id_b]
