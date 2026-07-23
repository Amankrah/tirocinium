"""The course search endpoint (backend guide section 7 and section 4 Stage 4,
milestone 3.4). Nested under the course per decision 0013. Searching a course's
submissions is a professor-and-owner surface: students never search, so this
gates through ensure_course_owner (a seat token is rejected, a non-owner gets
403, an unknown course 404), then runs hybrid retrieval over the shard."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.auth.deps import get_shards, require_professor
from app.auth.models import Identity
from app.courses.routes import ensure_course_owner
from app.db.shards import ShardManager
from app.problems import Problem
from app.retrieval.model import Embedder, get_embedder
from app.retrieval.search import SearchResults, hybrid_search

router = APIRouter(prefix="/api/v1/courses", tags=["retrieval"])


@router.get(
    "/{course_id}/search",
    response_model=SearchResults,
    responses={401: {"model": Problem}, 403: {"model": Problem}, 404: {"model": Problem}},
)
async def search_course(
    course_id: int,
    identity: Annotated[Identity, Depends(require_professor)],
    shards: Annotated[ShardManager, Depends(get_shards)],
    embedder: Annotated[Embedder, Depends(get_embedder)],
    q: Annotated[str, Query(min_length=1, max_length=500)],
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
) -> SearchResults:
    """Hybrid retrieval over a course's indexed submissions: FTS5 BM25 and int8
    vector similarity fused with reciprocal rank fusion, so an exact term and a
    paraphrase both find the work."""
    await ensure_course_owner(shards, course_id, identity)
    return await hybrid_search(
        shards=shards,
        embedder=embedder,
        course_id=course_id,
        query=q,
        limit=limit,
    )
