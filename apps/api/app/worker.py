"""The arq worker process (backend guide section 4 Stages 2 to 3, milestone
3.3). Run it alongside the API with `arq app.worker.WorkerSettings`. On startup
it builds the data layer, object storage, the vision transcriber, and the Redis
event bus once into the job context; each job runs the submission pipeline.

This process is where Redis is required at runtime; the API degrades gracefully
without it (enqueue and SSE no-op), but the worker is the consumer, so it needs
the broker.

Every job resumes the trace of the request that enqueued it (milestone 8.5),
so a submission's whole lifecycle, the API call, the pipeline, indexing, and
evidence emission, is one trace rather than four. `run_job` is the one place
that happens: jobs stay plain functions and the wrapper carries the telemetry,
so adding a job never means remembering to instrument it.
"""

import os
import time
from collections.abc import Callable, Coroutine, Mapping
from pathlib import Path
from typing import Any, ClassVar

from arq.connections import RedisSettings
from arq.worker import func as arq_func

from app.db.shards import ShardManager
from app.e2e import e2e_assessor, e2e_embedder, e2e_transcriber
from app.events import RedisEventBus
from app.imports.decoder import (
    AnthropicFigureDetector,
    PdfiumDecoder,
    PdfiumFigureExtractor,
)
from app.imports.pipeline import run_import_pipeline
from app.imports.segmentation import AnthropicSegmenter
from app.mastery.emission import emit_submission_evidence
from app.mastery.model import AnthropicWorkingAssessor
from app.mastery.params import active_params_json
from app.retrieval.indexing import index_submission
from app.retrieval.model import OpenAIEmbedder
from app.storage import get_object_storage
from app.telemetry import (
    configure_observability,
    continued_span,
    record_job_duration,
    record_queue_depth,
)
from app.transcription.model import AnthropicTranscriber
from app.transcription.pipeline import STATUS_PROCESSED, run_submission_pipeline
from app.variants.model import AnthropicVariantGenerator, AnthropicVariantVerifier
from app.variants.pipeline import generate_variant as run_variant_generation
from app.variants.pool import fill_pool


def _redis_url() -> str:
    return os.environ.get("TIRO_REDIS_URL", "redis://localhost:6379")


def _data_dir() -> Path:
    return Path(os.environ.get("TIRO_DATA_DIR", "data"))


async def run_job[T](
    name: str,
    trace_context: Mapping[str, str] | None,
    work: Callable[[], Coroutine[Any, Any, T]],
    **attributes: Any,
) -> T:
    """Run one job inside the trace that enqueued it, timing it and recording
    the outcome. A job that raises is still measured, as a failure: a duration
    dashboard that only counts successes hides exactly the incidents it exists
    to show."""
    started = time.perf_counter()
    outcome = "error"
    try:
        with continued_span(f"worker.{name}", trace_context, **attributes):
            result = await work()
            outcome = "ok"
            return result
    finally:
        record_job_duration(name, outcome, (time.perf_counter() - started) * 1000)


async def startup(ctx: dict[str, Any]) -> None:
    configure_observability("tirocinium-worker")
    shards = ShardManager(_data_dir())
    await shards.__aenter__()
    ctx["shards"] = shards
    ctx["storage"] = get_object_storage()
    # The seeded browser journeys substitute recorded seams here, and only
    # here, through one explicit environment variable (decision 0064). Unset,
    # which is every deployment, each factory returns None and the live seam
    # below stands.
    ctx["transcriber"] = e2e_transcriber() or AnthropicTranscriber()
    ctx["embedder"] = e2e_embedder() or OpenAIEmbedder()
    ctx["decoder"] = PdfiumDecoder()
    ctx["figure_extractor"] = PdfiumFigureExtractor()
    ctx["figure_detector"] = AnthropicFigureDetector()
    ctx["segmenter"] = AnthropicSegmenter()
    ctx["variant_generator"] = AnthropicVariantGenerator()
    ctx["variant_verifier"] = AnthropicVariantVerifier()
    ctx["assessor"] = e2e_assessor() or AnthropicWorkingAssessor()
    ctx["bus"] = RedisEventBus(_redis_url())


ARQ_QUEUE = "arq:queue"


async def on_job_start(ctx: dict[str, Any]) -> None:
    """Dashboard two: sample the queue depth as each job picks up. Sampling on
    job start rather than on a timer means the reading exists exactly when the
    queue is being worked, which is when depth means something. A broker that
    cannot answer is not worth failing a job over."""
    redis = ctx.get("redis")
    if redis is None:
        return
    try:
        record_queue_depth(ARQ_QUEUE, int(await redis.zcard(ARQ_QUEUE)))
    except Exception:
        return


async def shutdown(ctx: dict[str, Any]) -> None:
    shards = ctx.get("shards")
    if isinstance(shards, ShardManager):
        shards.close()
    bus = ctx.get("bus")
    if isinstance(bus, RedisEventBus):
        await bus.aclose()


async def process_submission(
    ctx: dict[str, Any],
    course_id: int,
    submission_id: int,
    trace_context: Mapping[str, str] | None = None,
) -> str:
    """The one job: transcribe a completed submission end to end (Stages 2 to
    3), then index it for retrieval (Stage 4). Indexing runs only on a processed
    result and is idempotent, so a job retry re-indexes cleanly (the
    transcription cache makes the re-run free)."""
    return await run_job(
        "process_submission",
        trace_context,
        lambda: _process_submission(ctx, course_id, submission_id),
        **{"course.id": course_id, "submission.id": submission_id},
    )


async def _process_submission(
    ctx: dict[str, Any], course_id: int, submission_id: int
) -> str:
    status = await run_submission_pipeline(
        shards=ctx["shards"],
        storage=ctx["storage"],
        transcriber=ctx["transcriber"],
        bus=ctx["bus"],
        course_id=course_id,
        submission_id=submission_id,
        # Mode B (6.5.1): an exported handwriting PDF renders to page rasters
        # through the same decoder the import pipeline uses.
        decoder=ctx["decoder"],
    )
    if status == STATUS_PROCESSED:
        await index_submission(
            shards=ctx["shards"],
            embedder=ctx["embedder"],
            course_id=course_id,
            submission_id=submission_id,
        )
        # Stage: evidence emission (milestone 6.2). Idempotent, so a job
        # retry that already emitted this submission's events emits nothing.
        await emit_submission_evidence(
            shards=ctx["shards"],
            storage=ctx["storage"],
            assessor=ctx["assessor"],
            course_id=course_id,
            submission_id=submission_id,
            params_json=await active_params_json(ctx["shards"]),
        )
    return status


async def process_import(
    ctx: dict[str, Any],
    course_id: int,
    import_id: int,
    trace_context: Mapping[str, str] | None = None,
) -> str:
    """The decode job (milestone 4.1): turn an uploaded PDF into cached per-page
    markdown. Idempotent through the content-hash cache, so a retry is free."""
    return await run_job(
        "process_import",
        trace_context,
        lambda: _process_import(ctx, course_id, import_id),
        **{"course.id": course_id, "import.id": import_id},
    )


async def _process_import(ctx: dict[str, Any], course_id: int, import_id: int) -> str:
    return await run_import_pipeline(
        shards=ctx["shards"],
        storage=ctx["storage"],
        decoder=ctx["decoder"],
        transcriber=ctx["transcriber"],
        figure_extractor=ctx["figure_extractor"],
        figure_detector=ctx["figure_detector"],
        segmenter=ctx["segmenter"],
        course_id=course_id,
        import_id=import_id,
    )


async def generate_variant(
    ctx: dict[str, Any],
    course_id: int,
    case_study_id: int,
    seed: int,
    trace_context: Mapping[str, str] | None = None,
) -> str:
    """The generation-and-verification loop for one seed (milestone 5.3).
    Idempotent by the (case study, seed) unique index: a retried job that
    finds its variant already stored is a no-op, never a second model call."""
    return await run_job(
        "generate_variant",
        trace_context,
        lambda: _generate_variant(ctx, course_id, case_study_id, seed),
        **{"course.id": course_id, "case_study.id": case_study_id, "variant.seed": seed},
    )


async def _generate_variant(
    ctx: dict[str, Any], course_id: int, case_study_id: int, seed: int
) -> str:
    return await run_variant_generation(
        shards=ctx["shards"],
        storage=ctx["storage"],
        generator=ctx["variant_generator"],
        verifier=ctx["variant_verifier"],
        course_id=course_id,
        case_study_id=case_study_id,
        seed=seed,
    )


async def fill_variant_pool(
    ctx: dict[str, Any],
    course_id: int,
    case_study_id: int,
    trace_context: Mapping[str, str] | None = None,
) -> dict[str, int]:
    """Top a published case study's pool up to the target (milestone 5.4).
    Sequential by construction (one job per case study), which is the
    generation concurrency cap; budget-bounded by the course's token usage."""
    return await run_job(
        "fill_variant_pool",
        trace_context,
        lambda: _fill_variant_pool(ctx, course_id, case_study_id),
        **{"course.id": course_id, "case_study.id": case_study_id},
    )


async def _fill_variant_pool(
    ctx: dict[str, Any], course_id: int, case_study_id: int
) -> dict[str, int]:
    return await fill_pool(
        shards=ctx["shards"],
        storage=ctx["storage"],
        generator=ctx["variant_generator"],
        verifier=ctx["variant_verifier"],
        course_id=course_id,
        case_study_id=case_study_id,
    )


# How long one job may run before arq cancels it. arq's default is 300
# seconds, which is the wrong order of magnitude for two of these four jobs
# and silently truncates them (decision 0090).
#
# A pool fill generates variants one at a time, by design: that sequencing is
# the generation concurrency cap made structural (milestone 5.4). Each variant
# is a generation call and an independent re-solve, so roughly a minute, and
# the fill may attempt three times its target before giving up. At the shipped
# target of 20 that is an hour of honest work against a five-minute ceiling,
# so the pool could never reach its own default target: the job was killed
# mid-fill and the shortfall looked like a flagged-variant problem.
#
# A submission is bounded differently: at most 25 pages, each preprocessed and
# read by a vision model, so tens of minutes is the realistic worst case.
# An import decodes up to 200 pages and then segments them.
#
# These are ceilings on runaway work, not expected durations. They are set per
# function rather than globally so a hung submission cannot hold a worker slot
# for the hour a legitimate pool fill needs.
POOL_FILL_TIMEOUT = 2 * 60 * 60
SUBMISSION_TIMEOUT = 45 * 60
IMPORT_TIMEOUT = 90 * 60
VARIANT_TIMEOUT = 15 * 60


class WorkerSettings:
    """arq entry point: `arq app.worker.WorkerSettings`."""

    functions: ClassVar[list[Any]] = [
        arq_func(process_submission, timeout=SUBMISSION_TIMEOUT),
        arq_func(process_import, timeout=IMPORT_TIMEOUT),
        arq_func(generate_variant, timeout=VARIANT_TIMEOUT),
        arq_func(fill_variant_pool, timeout=POOL_FILL_TIMEOUT),
    ]
    on_startup = startup
    on_shutdown = shutdown
    on_job_start = on_job_start
    redis_settings = RedisSettings.from_dsn(_redis_url())
