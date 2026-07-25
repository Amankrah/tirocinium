"""Milestone 4.4 (backend): the confirm endpoint. A staged item becomes a draft
case study with its figure references intact, idempotently; the item and its
figures then survive the 30-day purge. Plus listing staged items and the
professor-and-owner authorization surface. Items are seeded straight into the
shard (as the seat and submission suites seed), so the test never runs the
worker."""

import io
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.compression import compress_text, decompress_text
from app.db import ShardManager
from app.db.connection import connect
from app.imports.purge import THIRTY_DAYS_SECONDS, purge_stale_imports
from app.main import create_app
from app.storage import get_object_storage

SECRET = "test-secret-not-for-production-0123"
PASSWORD = "a sensible passphrase"


class FakeStorage:
    def __init__(self) -> None:
        self.objects: dict[tuple[str, str], bytes] = {}

    def create_bucket(self, *, Bucket: str) -> object:
        return {}

    def put_object(self, *, Bucket: str, Key: str, Body: Any) -> object:
        self.objects[(Bucket, Key)] = Body.read() if hasattr(Body, "read") else bytes(Body)
        return {}

    def get_object(self, *, Bucket: str, Key: str) -> Any:
        return {"Body": io.BytesIO(self.objects[(Bucket, Key)])}

    def generate_presigned_url(
        self, ClientMethod: str, Params: dict[str, str], ExpiresIn: int
    ) -> str:
        return f"https://storage.test/{Params['Key']}"


@pytest.fixture()
def client(tmp_path: Path) -> Iterator[TestClient]:
    app = create_app(data_dir=tmp_path, jwt_secret=SECRET)
    app.dependency_overrides[get_object_storage] = FakeStorage
    with TestClient(app) as c:
        yield c


def professor(client: TestClient, email: str = "prof@example.edu") -> dict[str, str]:
    r = client.post("/api/v1/auth/signup", json={"email": email, "password": PASSWORD})
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def make_course(client: TestClient, headers: dict[str, str]) -> int:
    r = client.post("/api/v1/courses", json={"title": "FDSC 315"}, headers=headers)
    assert r.status_code == 201, r.text
    return int(r.json()["id"])


def ensure_shard(client: TestClient, headers: dict[str, str], course_id: int) -> None:
    # A course-scoped read opens and migrates the shard before we seed it.
    assert (
        client.get(f"/api/v1/courses/{course_id}/case-studies", headers=headers).status_code
        == 200
    )


def seed_item(
    tmp_path: Path,
    course_id: int,
    *,
    question: str = "Compute the NPV. ![f](fig://{fig})",
    title: str = "NPV",
) -> tuple[int, int, int]:
    """Insert a ready import job with one pending item and one assigned figure."""
    conn = connect(tmp_path / "courses" / f"{course_id}.db")
    try:
        job = conn.execute(
            "INSERT INTO import_jobs (course_id, storage_key, status, created_at)"
            " VALUES (?, 'k', 'ready', 0)",
            (course_id,),
        )
        job_id = int(job.lastrowid or 0)
        figure = conn.execute(
            "INSERT INTO figures (content_hash, storage_key, source, width_px,"
            " height_px, created_at) VALUES ('h', 'k', 'embedded_raster', 10, 10, 0)"
        )
        figure_id = int(figure.lastrowid or 0)
        item = conn.execute(
            "INSERT INTO import_items (job_id, title, question_z, solution_z, page_span,"
            " confidence, notes, model_id, prompt_version, state)"
            " VALUES (?, ?, ?, ?, '0', 0.9, NULL, 'm', 'v1', 'pending')",
            (
                job_id,
                title,
                compress_text(conn, "problem_text", question.replace("{fig}", "1")),
                compress_text(conn, "problem_text", "I = V/R"),
            ),
        )
        item_id = int(item.lastrowid or 0)
        conn.execute(
            "INSERT INTO item_figures (item_id, figure_id, role) VALUES (?, ?, 'essential')",
            (item_id, figure_id),
        )
        return job_id, item_id, figure_id
    finally:
        conn.close()


def _case_study(tmp_path: Path, course_id: int, case_study_id: int) -> tuple[str, str]:
    conn = connect(tmp_path / "courses" / f"{course_id}.db")
    try:
        row = conn.execute(
            "SELECT status, body_z FROM case_studies WHERE id = ?", (case_study_id,)
        ).fetchone()
        return str(row[0]), decompress_text(conn, "problem_text", bytes(row[1]))
    finally:
        conn.close()


def test_confirm_creates_a_draft_case_study(client: TestClient, tmp_path: Path) -> None:
    headers = professor(client)
    course_id = make_course(client, headers)
    ensure_shard(client, headers, course_id)
    _job, item_id, _fig = seed_item(tmp_path, course_id)

    r = client.post(
        f"/api/v1/courses/{course_id}/import-items/{item_id}/confirm", headers=headers
    )

    assert r.status_code == 200, r.text
    body = r.json()
    assert body["item_id"] == item_id
    assert body["state"] == "confirmed"
    status, case_body = _case_study(tmp_path, course_id, body["case_study_id"])
    assert status == "draft"
    assert "Compute the NPV." in case_body
    assert "fig://1" in case_body  # the figure token is carried into the draft

    # The item is marked confirmed and linked.
    items = client.get(
        f"/api/v1/courses/{course_id}/imports/{_job}/items", headers=headers
    ).json()["items"]
    assert items[0]["state"] == "confirmed"
    assert items[0]["case_study_id"] == body["case_study_id"]
    figures = items[0]["figures"]
    assert [f["figure_id"] for f in figures] == [_fig]
    assert figures[0]["token"] == f"fig://{_fig}"
    assert figures[0]["image_url"]  # a presigned crop URL, not just an id


def test_confirm_is_idempotent(client: TestClient, tmp_path: Path) -> None:
    headers = professor(client)
    course_id = make_course(client, headers)
    ensure_shard(client, headers, course_id)
    _job, item_id, _fig = seed_item(tmp_path, course_id)

    first = client.post(
        f"/api/v1/courses/{course_id}/import-items/{item_id}/confirm", headers=headers
    )
    second = client.post(
        f"/api/v1/courses/{course_id}/import-items/{item_id}/confirm", headers=headers
    )

    assert first.status_code == second.status_code == 200
    assert first.json()["case_study_id"] == second.json()["case_study_id"]


async def test_confirmed_item_and_figure_survive_the_purge(
    client: TestClient, tmp_path: Path
) -> None:
    headers = professor(client)
    course_id = make_course(client, headers)
    ensure_shard(client, headers, course_id)
    _job, item_id, figure_id = seed_item(tmp_path, course_id)
    client.post(
        f"/api/v1/courses/{course_id}/import-items/{item_id}/confirm", headers=headers
    )

    # Purge with a cutoff well past the (created_at=0) job: confirmation flipped
    # the job to 'confirmed', so it and its figure are spared.
    async with ShardManager(tmp_path) as shards:
        counts = await purge_stale_imports(
            shards=shards, course_id=course_id, now=100 * THIRTY_DAYS_SECONDS
        )

    assert counts == {"jobs": 0, "items": 0, "figures": 0}
    conn = connect(tmp_path / "courses" / f"{course_id}.db")
    try:
        assert conn.execute("SELECT 1 FROM figures WHERE id = ?", (figure_id,)).fetchone()
        assert conn.execute(
            "SELECT state FROM import_items WHERE id = ?", (item_id,)
        ).fetchone()[0] == "confirmed"
    finally:
        conn.close()


def _metric(tmp_path: Path, course_id: int, item_id: int) -> tuple[int, int]:
    conn = connect(tmp_path / "courses" / f"{course_id}.db")
    try:
        row = conn.execute(
            "SELECT text_edit_distance, figure_interventions FROM import_item_metrics"
            " WHERE item_id = ?",
            (item_id,),
        ).fetchone()
        return int(row[0]), int(row[1])
    finally:
        conn.close()


def test_confirm_logs_edit_distance_and_interventions(
    client: TestClient, tmp_path: Path
) -> None:
    headers = professor(client)
    course_id = make_course(client, headers)
    ensure_shard(client, headers, course_id)
    _job, item_id, _fig = seed_item(tmp_path, course_id, question="ABCDE")

    r = client.post(
        f"/api/v1/courses/{course_id}/import-items/{item_id}/confirm",
        json={"question_md": "ABXDE", "figure_interventions": 2},
        headers=headers,
    )

    assert r.status_code == 200, r.text
    assert r.json()["text_edit_distance"] == 1  # one substitution
    assert _metric(tmp_path, course_id, item_id) == (1, 2)
    # The professor's edited text, not the extraction, is what became the draft.
    _status, body = _case_study(tmp_path, course_id, r.json()["case_study_id"])
    assert body == "ABXDE"


def test_confirm_without_edits_logs_zero_distance(
    client: TestClient, tmp_path: Path
) -> None:
    headers = professor(client)
    course_id = make_course(client, headers)
    ensure_shard(client, headers, course_id)
    _job, item_id, _fig = seed_item(tmp_path, course_id, question="unchanged")

    r = client.post(
        f"/api/v1/courses/{course_id}/import-items/{item_id}/confirm", headers=headers
    )

    assert r.json()["text_edit_distance"] == 0
    assert _metric(tmp_path, course_id, item_id) == (0, 0)


def test_confirm_unknown_item_is_404(client: TestClient, tmp_path: Path) -> None:
    headers = professor(client)
    course_id = make_course(client, headers)
    ensure_shard(client, headers, course_id)
    r = client.post(
        f"/api/v1/courses/{course_id}/import-items/999999/confirm", headers=headers
    )
    assert r.status_code == 404


def test_non_owner_cannot_confirm(client: TestClient, tmp_path: Path) -> None:
    owner = professor(client)
    course_id = make_course(client, owner)
    ensure_shard(client, owner, course_id)
    _job, item_id, _fig = seed_item(tmp_path, course_id)
    other = professor(client, email="other@example.edu")
    r = client.post(
        f"/api/v1/courses/{course_id}/import-items/{item_id}/confirm", headers=other
    )
    assert r.status_code == 403


def test_confirm_requires_authentication(client: TestClient, tmp_path: Path) -> None:
    headers = professor(client)
    course_id = make_course(client, headers)
    ensure_shard(client, headers, course_id)
    _job, item_id, _fig = seed_item(tmp_path, course_id)
    r = client.post(f"/api/v1/courses/{course_id}/import-items/{item_id}/confirm")
    assert r.status_code == 401
