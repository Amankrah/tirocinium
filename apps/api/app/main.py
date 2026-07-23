"""Application factory and the (for now minimal) route surface.

Everything is versioned under /api/v1 (backend guide section 7). The only
endpoint in Phase 0.3 is health; it exists so the contract pipeline has a
real schema to carry, and so deploys have something to probe.
"""

from typing import Literal

from fastapi import APIRouter, FastAPI
from pydantic import BaseModel

API_TITLE = "Tirocinium API"
API_VERSION = "0.1.0"


class HealthOut(BaseModel):
    """Liveness of the API process itself; no dependencies are probed."""

    status: Literal["ok"]


router = APIRouter(prefix="/api/v1")


@router.get("/health", response_model=HealthOut, tags=["meta"])
def health() -> HealthOut:
    return HealthOut(status="ok")


def create_app() -> FastAPI:
    app = FastAPI(title=API_TITLE, version=API_VERSION)
    app.include_router(router)
    return app
