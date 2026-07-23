"""The API contract artifact (Phase 0.3).

The committed apps/api/openapi.json is the seam between the two developers:
FastAPI generates it, apps/web generates its typed client from it, and CI
fails when either committed artifact is stale. Rendering is deterministic
(sorted keys, fixed indent, trailing newline) so staleness is a byte
comparison, never a semantic diff.
"""

import json
from pathlib import Path
from typing import Any

from app.main import create_app

SPEC_PATH = Path(__file__).resolve().parent.parent / "openapi.json"


def openapi_document() -> dict[str, Any]:
    return create_app().openapi()


def render(document: dict[str, Any]) -> str:
    return json.dumps(document, indent=2, sort_keys=True) + "\n"


def write_spec(path: Path = SPEC_PATH) -> Path:
    path.write_text(render(openapi_document()), encoding="utf-8", newline="\n")
    return path
