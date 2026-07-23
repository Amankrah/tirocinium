"""Application factory and the (for now minimal) route surface.

Everything is versioned under /api/v1 (backend guide section 7). The only
endpoint so far is health; the route modules (auth, courses, generation,
submissions, retrieval) land with their phases. Startup opens the data layer
and migrates every shard (milestone 1.1); the OpenAPI exporter never starts
the lifespan, so contract generation stays database-free.
"""

import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, FastAPI
from pydantic import BaseModel

from app.db import ShardManager

API_TITLE = "Tirocinium API"
API_VERSION = "0.1.0"


class HealthOut(BaseModel):
    """Liveness of the API process itself; no dependencies are probed."""

    status: Literal["ok"]


router = APIRouter(prefix="/api/v1")


@router.get("/health", response_model=HealthOut, tags=["meta"])
def health() -> HealthOut:
    return HealthOut(status="ok")


def create_app(data_dir: Path | None = None) -> FastAPI:
    """Build the application. data_dir defaults to $TIRO_DATA_DIR or ./data;
    the data layer opens on startup, not at construction, so building the
    app (for contract export, for tests that never hit a shard) costs
    nothing."""
    resolved = data_dir or Path(os.environ.get("TIRO_DATA_DIR", "data"))

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        async with ShardManager(resolved) as shards:
            app.state.shards = shards
            yield

    app = FastAPI(title=API_TITLE, version=API_VERSION, lifespan=lifespan)
    app.include_router(router)
    return app
