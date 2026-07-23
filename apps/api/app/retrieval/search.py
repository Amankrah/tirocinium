"""Hybrid retrieval with reciprocal rank fusion (backend guide section 4 Stage
4, milestone 3.4, decision 0020). A query retrieves submissions two ways,
independently: FTS5 BM25 over the recognized handwriting (exact terms) and
int8 cosine similarity over the embedding (paraphrase). The two rankings are
fused with RRF, the standard 1/(k + rank) sum, which is what lets both an exact
term and a paraphrase surface the same seeded submission.

Similarity is brute-forced over the course's submission embeddings: at this
corpus size (hundreds of submissions per course) an exact scan beats the
complexity of an ANN index, and it keeps the cosine exact.
"""

import re
import sqlite3
from collections.abc import Callable, Sequence

from platform_core import embedding
from pydantic import BaseModel

from app.compression import decompress_text
from app.db.shards import ShardManager
from app.retrieval.indexing import KIND_SUBMISSION
from app.retrieval.model import DEFAULT_EMBEDDING_MODEL, Embedder

# The RRF constant (Cormack et al. 2009); 60 is the field-standard default and
# damps the influence of any single ranking's top positions.
RRF_K = 60

# How many candidates to pull from each ranking before fusing. Generous for
# this corpus; fusion and the final limit trim from here.
CANDIDATE_LIMIT = 200

# The snippet length shown per hit; the scan remains the source of truth, so
# this is orientation, not the full reading.
SNIPPET_CHARS = 240

_WORD = re.compile(r"\w+", re.UNICODE)


class SearchHit(BaseModel):
    submission_id: int
    score: float
    snippet: str
    recognition_conf: float | None
    status: str


class SearchResults(BaseModel):
    query: str
    hits: list[SearchHit]


def _fts_match(query: str) -> str | None:
    """Turn free user text into a safe FTS5 MATCH expression: OR the quoted word
    tokens, so any term can match and no punctuation is interpreted as FTS5
    syntax (a hostile or malformed query is data, not an operator). None when
    the query has no word characters at all."""
    terms = _WORD.findall(query)
    if not terms:
        return None
    return " OR ".join(f'"{term}"' for term in terms)


def _rrf_fuse(rankings: Sequence[Sequence[int]], k: int = RRF_K) -> list[tuple[int, float]]:
    """Reciprocal rank fusion: each ranking contributes 1/(k + rank) to every id
    it ranks (rank is 1-based). Returns (id, score) sorted by score descending,
    ties broken by id for determinism."""
    scores: dict[int, float] = {}
    for ranking in rankings:
        for rank, ref_id in enumerate(ranking, start=1):
            scores[ref_id] = scores.get(ref_id, 0.0) + 1.0 / (k + rank)
    return sorted(scores.items(), key=lambda item: (-item[1], item[0]))


async def hybrid_search(
    *,
    shards: ShardManager,
    embedder: Embedder,
    course_id: int,
    query: str,
    limit: int,
    model_id: str = DEFAULT_EMBEDDING_MODEL,
) -> SearchResults:
    reads = shards.course_reads(course_id)

    query_vector = await embedder.embed(query, model_id=model_id)
    q_codes, _ = embedding.quantize(query_vector)

    fts_ids, emb_rows = await reads.run(_gather(_fts_match(query), CANDIDATE_LIMIT))

    # Vector ranking: cosine of the query against every submission embedding,
    # best first. The scales cancel in a cosine, so only the codes are needed.
    scored = sorted(
        ((ref_id, embedding.cosine_i8(q_codes, vec)) for ref_id, vec in emb_rows),
        key=lambda item: (-item[1], item[0]),
    )
    vec_ids = [ref_id for ref_id, _ in scored[:CANDIDATE_LIMIT]]

    fused = _rrf_fuse([fts_ids, vec_ids])[:limit]
    if not fused:
        return SearchResults(query=query, hits=[])

    meta = await reads.run(_fetch_meta([ref_id for ref_id, _ in fused]))
    hits = [
        SearchHit(
            submission_id=ref_id,
            score=score,
            snippet=meta[ref_id][0],
            recognition_conf=meta[ref_id][1],
            status=meta[ref_id][2],
        )
        for ref_id, score in fused
        if ref_id in meta
    ]
    return SearchResults(query=query, hits=hits)


# ------------------------------------------------------------ shard callables


def _gather(
    match: str | None, candidate_limit: int
) -> Callable[[sqlite3.Connection], tuple[list[int], list[tuple[int, bytes]]]]:
    def read(conn: sqlite3.Connection) -> tuple[list[int], list[tuple[int, bytes]]]:
        fts_ids: list[int] = []
        if match is not None:
            rows = conn.execute(
                "SELECT ref_id FROM search_fts"
                " WHERE search_fts MATCH ? AND kind = ?"
                " ORDER BY bm25(search_fts) LIMIT ?",
                (match, KIND_SUBMISSION, candidate_limit),
            ).fetchall()
            fts_ids = [int(r[0]) for r in rows]
        emb = conn.execute(
            "SELECT ref_id, vec_i8 FROM embeddings WHERE ref_kind = ?",
            (KIND_SUBMISSION,),
        ).fetchall()
        emb_rows = [(int(r[0]), bytes(r[1])) for r in emb]
        return fts_ids, emb_rows

    return read


def _fetch_meta(
    ids: Sequence[int],
) -> Callable[[sqlite3.Connection], dict[int, tuple[str, float | None, str]]]:
    def read(conn: sqlite3.Connection) -> dict[int, tuple[str, float | None, str]]:
        out: dict[int, tuple[str, float | None, str]] = {}
        for submission_id in ids:
            row = conn.execute(
                "SELECT recognized_z, recognition_conf, status FROM submissions"
                " WHERE id = ?",
                (submission_id,),
            ).fetchone()
            if row is None:
                continue
            text = "" if row[0] is None else decompress_text(conn, "handwriting", bytes(row[0]))
            snippet = " ".join(text.split())[:SNIPPET_CHARS]
            conf = None if row[1] is None else float(row[1])
            out[submission_id] = (snippet, conf, str(row[2]))
        return out

    return read
