"""The arq worker process (backend guide section 4 Stages 2 to 3, milestone
3.3). Run it alongside the API with `arq app.worker.WorkerSettings`. On startup
it builds the data layer, object storage, the vision transcriber, and the Redis
event bus once into the job context; each job runs the submission pipeline.

This process is where Redis is required at runtime; the API degrades gracefully
without it (enqueue and SSE no-op), but the worker is the consumer, so it needs
the broker.
"""

import os
from collections.abc import Callable, Coroutine
from pathlib import Path
from typing import Any, ClassVar

from arq.connections import RedisSettings

from app.db.shards import ShardManager
from app.events import RedisEventBus
from app.retrieval.indexing import index_submission
from app.retrieval.model import OpenAIEmbedder
from app.storage import get_object_storage
from app.transcription.model import AnthropicTranscriber
from app.transcription.pipeline import STATUS_PROCESSED, run_submission_pipeline


def _redis_url() -> str:
    return os.environ.get("TIRO_REDIS_URL", "redis://localhost:6379")


def _data_dir() -> Path:
    return Path(os.environ.get("TIRO_DATA_DIR", "data"))


async def startup(ctx: dict[str, Any]) -> None:
    shards = ShardManager(_data_dir())
    await shards.__aenter__()
    ctx["shards"] = shards
    ctx["storage"] = get_object_storage()
    ctx["transcriber"] = AnthropicTranscriber()
    ctx["embedder"] = OpenAIEmbedder()
    ctx["bus"] = RedisEventBus(_redis_url())


async def shutdown(ctx: dict[str, Any]) -> None:
    shards = ctx.get("shards")
    if isinstance(shards, ShardManager):
        shards.close()
    bus = ctx.get("bus")
    if isinstance(bus, RedisEventBus):
        await bus.aclose()


async def process_submission(ctx: dict[str, Any], course_id: int, submission_id: int) -> str:
    """The one job: transcribe a completed submission end to end (Stages 2 to
    3), then index it for retrieval (Stage 4). Indexing runs only on a processed
    result and is idempotent, so a job retry re-indexes cleanly (the
    transcription cache makes the re-run free)."""
    status = await run_submission_pipeline(
        shards=ctx["shards"],
        storage=ctx["storage"],
        transcriber=ctx["transcriber"],
        bus=ctx["bus"],
        course_id=course_id,
        submission_id=submission_id,
    )
    if status == STATUS_PROCESSED:
        await index_submission(
            shards=ctx["shards"],
            embedder=ctx["embedder"],
            course_id=course_id,
            submission_id=submission_id,
        )
    return status


class WorkerSettings:
    """arq entry point: `arq app.worker.WorkerSettings`."""

    functions: ClassVar[list[Callable[..., Coroutine[Any, Any, Any]]]] = [process_submission]
    on_startup = startup
    on_shutdown = shutdown
    redis_settings = RedisSettings.from_dsn(_redis_url())
