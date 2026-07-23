"""Stage 4 indexing (backend guide section 4, milestone 3.4, decision 0020):
make a processed submission searchable. This runs as its own step after the
transcription pipeline, not inside it, so Stages 2 to 3 and their tests are
untouched. For one submission: read the aggregated recognized text, insert it
into the FTS5 index, embed it through the provider seam, quantize the vector in
platform_core, and store the int8 codes with the float32 original kept for
requantization.

The step is idempotent: it clears a submission's prior FTS and embedding rows
first, so a retry after a transient failure re-indexes cleanly (and the
transcription cache makes the pipeline re-run free). Only submissions are
indexed here; variants and problem text (the other ref_kind the schema
anticipates) arrive with the variant pool in Phase 5.
"""

import sqlite3
import struct
from collections.abc import Callable

from platform_core import embedding

from app.compression import compress_bytes, decompress_text
from app.db.shards import ShardManager
from app.retrieval.model import DEFAULT_EMBEDDING_MODEL, Embedder

# The single ref/kind these indices use in 3.4. FTS5's `kind` column and the
# embeddings table's `ref_kind` share the vocabulary so a hit in either points
# back to the same submission row.
KIND_SUBMISSION = "submission"


async def index_submission(
    *,
    shards: ShardManager,
    embedder: Embedder,
    course_id: int,
    submission_id: int,
    model_id: str = DEFAULT_EMBEDDING_MODEL,
) -> bool:
    """Index one submission's recognized text for lexical and semantic
    retrieval. Returns True when it was indexed, False when there was nothing
    to index (no recognized text yet)."""
    reads = shards.course_reads(course_id)
    writer = shards.course(course_id)

    text = await reads.run(_read_recognized(submission_id))
    if not text:
        return False

    vector = await embedder.embed(text, model_id=model_id)
    codes, scale = embedding.quantize(vector)
    vec_f32_z = compress_bytes(struct.pack(f"<{len(vector)}f", *vector))

    await writer.run(
        _write_index(submission_id, text, codes, scale, vec_f32_z, model_id)
    )
    return True


async def backfill_course(
    *,
    shards: ShardManager,
    embedder: Embedder,
    course_id: int,
    model_id: str = DEFAULT_EMBEDDING_MODEL,
) -> int:
    """Index every processed submission in a course that has recognized text.
    Returns how many were indexed. For bringing an existing course's history
    into the indices (a new deployment, or a re-embed after a model change)."""
    ids = await shards.course_reads(course_id).run(_processed_submission_ids)
    indexed = 0
    for submission_id in ids:
        if await index_submission(
            shards=shards,
            embedder=embedder,
            course_id=course_id,
            submission_id=submission_id,
            model_id=model_id,
        ):
            indexed += 1
    return indexed


# ------------------------------------------------------------ shard callables


def _read_recognized(submission_id: int) -> Callable[[sqlite3.Connection], str]:
    def read(conn: sqlite3.Connection) -> str:
        row = conn.execute(
            "SELECT recognized_z FROM submissions WHERE id = ?", (submission_id,)
        ).fetchone()
        if row is None or row[0] is None:
            return ""
        return decompress_text(conn, "handwriting", bytes(row[0]))

    return read


def _processed_submission_ids(conn: sqlite3.Connection) -> list[int]:
    rows = conn.execute(
        "SELECT id FROM submissions"
        " WHERE status = 'processed' AND recognized_z IS NOT NULL ORDER BY id"
    ).fetchall()
    return [int(r[0]) for r in rows]


def _write_index(
    submission_id: int,
    text: str,
    codes: bytes,
    scale: float,
    vec_f32_z: bytes,
    model_id: str,
) -> Callable[[sqlite3.Connection], None]:
    def apply(conn: sqlite3.Connection) -> None:
        # Clear any prior rows so re-indexing is idempotent (FTS5 filters on the
        # UNINDEXED ref_id with a scan, which is fine at this row count).
        conn.execute(
            "DELETE FROM search_fts WHERE kind = ? AND ref_id = ?",
            (KIND_SUBMISSION, submission_id),
        )
        conn.execute(
            "INSERT INTO search_fts (content, kind, ref_id) VALUES (?, ?, ?)",
            (text, KIND_SUBMISSION, submission_id),
        )
        conn.execute(
            "INSERT OR REPLACE INTO embeddings"
            " (ref_kind, ref_id, vec_i8, scale, vec_f32_z, model_id)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            (KIND_SUBMISSION, submission_id, codes, scale, vec_f32_z, model_id),
        )

    return apply
