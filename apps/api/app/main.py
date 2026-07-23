"""Application factory and the (for now minimal) route surface.

Everything is versioned under /api/v1 (backend guide section 7). The only
endpoint so far is health; the route modules (auth, courses, generation,
submissions, retrieval) land with their phases. Startup opens the data layer
and migrates every shard (milestone 1.1); the OpenAPI exporter never starts
the lifespan, so contract generation stays database-free.
"""

import os
import secrets
import warnings
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, FastAPI
from pydantic import BaseModel

from app.auth import router as auth_router
from app.case_studies import router as case_studies_router
from app.concepts import router as concepts_router
from app.courses import router as courses_router
from app.db import ShardManager
from app.events import InMemoryEventBus, RedisEventBus
from app.problems import install_problem_details
from app.seats import router as seats_router
from app.seats.ratelimit import RateLimiter
from app.submissions import router as submissions_router
from app.tasks import ArqTaskQueue, NullTaskQueue

API_TITLE = "Tirocinium API"
API_VERSION = "0.1.0"


class HealthOut(BaseModel):
    """Liveness of the API process itself; no dependencies are probed."""

    status: Literal["ok"]


router = APIRouter(prefix="/api/v1")


@router.get("/health", response_model=HealthOut, tags=["meta"])
def health() -> HealthOut:
    return HealthOut(status="ok")


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
    install_problem_details(app)
    app.include_router(router)
    app.include_router(auth_router)
    app.include_router(courses_router)
    app.include_router(concepts_router)
    app.include_router(case_studies_router)
    app.include_router(seats_router)
    app.include_router(submissions_router)
    return app
