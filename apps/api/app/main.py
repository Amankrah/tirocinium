"""Application factory and the (for now minimal) route surface.

Everything is versioned under /api/v1 (backend guide section 7). The only
endpoint so far is health; the route modules (auth, courses, generation,
submissions, retrieval) land with their phases. Startup opens the data layer
and migrates every shard (milestone 1.1); the OpenAPI exporter never starts
the lifespan, so contract generation stays database-free.
"""

import os
import secrets
import time
import warnings
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Literal

from fastapi import APIRouter, FastAPI, Request, Response
from pydantic import BaseModel

from app.auth import router as auth_router
from app.case_studies import router as case_studies_router
from app.concepts import router as concepts_router
from app.courses import router as courses_router
from app.db import ShardManager
from app.defense import router as defense_router
from app.events import InMemoryEventBus, RedisEventBus
from app.imports import router as imports_router
from app.mastery import router as mastery_router
from app.params import router as params_router
from app.problems import install_problem_details
from app.reports import router as reports_router
from app.retrieval import router as retrieval_router
from app.seats import router as seats_router
from app.seats.ratelimit import RateLimiter
from app.submissions import review_router as submission_review_router
from app.submissions import router as submissions_router
from app.tasks import ArqTaskQueue, NullTaskQueue
from app.telemetry import configure_observability, record_api_latency, span
from app.unfold import router as unfold_router
from app.variants import router as variants_router

API_TITLE = "Tirocinium API"
API_VERSION = "0.1.0"


class HealthOut(BaseModel):
    """Liveness of the API process itself; no dependencies are probed."""

    status: Literal["ok"]


router = APIRouter(prefix="/api/v1")


@router.get("/health", response_model=HealthOut, tags=["meta"])
def health() -> HealthOut:
    return HealthOut(status="ok")


def install_request_telemetry(app: FastAPI) -> None:
    """One span and one latency measurement per request (milestone 8.5). The
    span is the root of everything the request does, including the native work
    below it, and it is what an enqueued job's trace context continues from.

    Metric labels use the matched route template, never the concrete path, so
    a course id or a submission id can never become label cardinality, and no
    identifier reaches the metrics backend at all."""

    @app.middleware("http")
    async def telemetry_middleware(request: Request, call_next: Any) -> Response:
        started = time.perf_counter()
        with span(
            f"{request.method} {request.url.path}",
            **{"http.request.method": request.method, "url.path": request.url.path},
        ) as current:
            response: Response = await call_next(request)
            current.set_attribute("http.response.status_code", response.status_code)
        # The route is only known after matching, and an unmatched request is
        # labelled as such rather than by its path.
        route = request.scope.get("route")
        template = getattr(route, "path", "unmatched")
        record_api_latency(
            str(template),
            request.method,
            response.status_code,
            (time.perf_counter() - started) * 1000,
        )
        return response


def create_app(
    data_dir: Path | None = None, jwt_secret: str | None = None
) -> FastAPI:
    """Build the application. data_dir defaults to $TIRO_DATA_DIR or ./data;
    the data layer opens on startup, not at construction, so building the
    app (for contract export, for tests that never hit a shard) costs
    nothing. The JWT secret comes from the argument, then $TIRO_JWT_SECRET;
    without either, a per-process random secret is used and a warning
    raised (dev only: every restart invalidates all professor sessions)."""
    resolved = data_dir or Path(os.environ.get("TIRO_DATA_DIR", "data"))
    resolved_secret = jwt_secret or os.environ.get("TIRO_JWT_SECRET")
    if resolved_secret is None:
        resolved_secret = secrets.token_hex(32)
        warnings.warn(
            "TIRO_JWT_SECRET is not set; using a per-process random secret."
            " Professor sessions will not survive a restart.",
            stacklevel=2,
        )

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        async with ShardManager(resolved) as shards:
            app.state.shards = shards
            # The transcription worker (milestone 3.3) talks to the API process
            # only through Redis: an arq queue for enqueue and pub/sub for SSE.
            # Both are optional here, so dev and the test suite run with no
            # broker (enqueue no-ops, SSE uses an in-process bus).
            redis_url = os.environ.get("TIRO_REDIS_URL")
            pool = None
            if redis_url:
                from arq import create_pool
                from arq.connections import RedisSettings

                pool = await create_pool(RedisSettings.from_dsn(redis_url))
                app.state.task_queue = ArqTaskQueue(pool)
                app.state.event_bus = RedisEventBus(redis_url)
            else:
                app.state.task_queue = NullTaskQueue()
                app.state.event_bus = InMemoryEventBus()
            try:
                yield
            finally:
                if pool is not None:
                    await pool.aclose()
                if isinstance(app.state.event_bus, RedisEventBus):
                    await app.state.event_bus.aclose()

    app = FastAPI(title=API_TITLE, version=API_VERSION, lifespan=lifespan)
    app.state.jwt_secret = resolved_secret
    app.state.rate_limiter = RateLimiter()
    configure_observability()
    install_problem_details(app)
    install_request_telemetry(app)
    app.include_router(router)
    app.include_router(auth_router)
    app.include_router(courses_router)
    app.include_router(concepts_router)
    app.include_router(case_studies_router)
    app.include_router(seats_router)
    app.include_router(submissions_router)
    app.include_router(submission_review_router)
    app.include_router(retrieval_router)
    app.include_router(imports_router)
    app.include_router(params_router)
    app.include_router(variants_router)
    app.include_router(mastery_router)
    app.include_router(reports_router)
    app.include_router(unfold_router)
    app.include_router(defense_router)
    return app
