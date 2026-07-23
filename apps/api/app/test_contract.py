"""Phase 0.3 gate tests: the health surface and the contract pipeline's
backend half. The web-client half of the staleness gate is the git-diff
check in CI, which this suite's spec-freshness test mirrors."""

from fastapi.testclient import TestClient

from app.contract import SPEC_PATH, openapi_document, render
from app.main import create_app


def test_health_endpoint() -> None:
    client = TestClient(create_app())
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_openapi_export_is_deterministic() -> None:
    assert render(openapi_document()) == render(openapi_document())


def test_committed_spec_is_fresh() -> None:
    """The committed openapi.json must match the code. If this fails:
    cd apps/api && python scripts/export_openapi.py, regenerate the web
    client, and commit both."""
    assert SPEC_PATH.read_text(encoding="utf-8") == render(openapi_document())
