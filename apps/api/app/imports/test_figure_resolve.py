"""Figure image serving (Phase 4.4 follow-up, decision 0032). One endpoint
resolves a figure to a presigned image URL, and it is what both the confirmation
surface and the reading surface's fig:// resolver (decision 0014) point at. A
professor who owns the course resolves any figure in it; a seat resolves a figure
only when a published case study carries it, and an unpublished figure is a 404
to a seat, indistinguishable from one that does not exist. Figures, items, and a
page are seeded straight into the shard; the seat comes through issue and redeem
so the token is real."""

import io
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.compression import compress_text
from app.db.connection import connect
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
def storage() -> FakeStorage:
    return FakeStorage()


@pytest.fixture()
def client(tmp_path: Path, storage: FakeStorage) -> Iterator[TestClient]:
    app = create_app(data_dir=tmp_path, jwt_secret=SECRET)
    app.dependency_overrides[get_object_storage] = lambda: storage
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
    assert (
        client.get(f"/api/v1/courses/{course_id}/case-studies", headers=headers).status_code
        == 200
    )


def seed_item_with_figure(tmp_path: Path, course_id: int) -> tuple[int, int]:
    """A ready job with one pending item carrying one figure. Returns
    (item_id, figure_id)."""
    conn = connect(tmp_path / "courses" / f"{course_id}.db")
    try:
        job = conn.execute(
            "INSERT INTO import_jobs (course_id, storage_key, status, created_at)"
            " VALUES (?, 'k', 'ready', 0)",
            (course_id,),
        )
        job_id = int(job.lastrowid or 0)
        figure = conn.execute(
            "INSERT INTO figures (content_hash, storage_key, source, page, bbox, width_px,"
            " height_px, caption, created_at) VALUES"
            " ('h', ?, 'embedded_raster', 0, '[0.1, 0.2, 0.3, 0.4]', 40, 30, 'Fig 1', 0)",
            (f"imports/{course_id}/figures/h.jpeg",),
        )
        figure_id = int(figure.lastrowid or 0)
        item = conn.execute(
            "INSERT INTO import_items (job_id, title, question_z, page_span, confidence,"
            " model_id, prompt_version, state) VALUES (?, 'Q', ?, '0', 0.9, 'm', 'v1',"
            " 'pending')",
            (job_id, compress_text(conn, "problem_text", "A question. ![f](fig://1)")),
        )
        item_id = int(item.lastrowid or 0)
        conn.execute(
            "INSERT INTO item_figures (item_id, figure_id, role) VALUES (?, ?, 'essential')",
            (item_id, figure_id),
        )
        return item_id, figure_id
    finally:
        conn.close()


def seat_token(
    client: TestClient, headers: dict[str, str], storage: FakeStorage, course_id: int
) -> str:
    assert (
        client.post(
            f"/api/v1/courses/{course_id}/seats", json={"count": 1}, headers=headers
        ).status_code
        == 201
    )
    csv_bytes = next(
        data for (_, key), data in storage.objects.items() if key.endswith(".csv")
    )
    code = csv_bytes.decode().strip().splitlines()[1].split(",")[1]
    r = client.post("/api/v1/seats/redeem", json={"code": code})
    assert r.status_code == 200, r.text
    return str(r.json()["token"])


def _confirm_and_publish(
    client: TestClient, headers: dict[str, str], course_id: int, item_id: int
) -> int:
    r = client.post(
        f"/api/v1/courses/{course_id}/import-items/{item_id}/confirm", headers=headers
    )
    assert r.status_code == 200, r.text
    case_study_id = int(r.json()["case_study_id"])
    assert (
        client.post(
            f"/api/v1/courses/{course_id}/case-studies/{case_study_id}/publish",
            headers=headers,
        ).status_code
        == 200
    )
    return case_study_id


def test_owner_resolves_any_figure(client: TestClient, tmp_path: Path) -> None:
    headers = professor(client)
    course_id = make_course(client, headers)
    ensure_shard(client, headers, course_id)
    _item, figure_id = seed_item_with_figure(tmp_path, course_id)

    r = client.get(f"/api/v1/courses/{course_id}/figures/{figure_id}", headers=headers)

    assert r.status_code == 200, r.text
    body = r.json()
    assert body["figure_id"] == figure_id
    assert body["source"] == "embedded_raster"
    assert body["image_url"].endswith("figures/h.jpeg")
    assert (body["width_px"], body["height_px"]) == (40, 30)


def test_owner_resolving_unknown_figure_is_404(client: TestClient, tmp_path: Path) -> None:
    headers = professor(client)
    course_id = make_course(client, headers)
    ensure_shard(client, headers, course_id)
    r = client.get(f"/api/v1/courses/{course_id}/figures/999999", headers=headers)
    assert r.status_code == 404


def test_seat_cannot_resolve_an_unpublished_figure(
    client: TestClient, tmp_path: Path, storage: FakeStorage
) -> None:
    headers = professor(client)
    course_id = make_course(client, headers)
    ensure_shard(client, headers, course_id)
    _item, figure_id = seed_item_with_figure(tmp_path, course_id)
    token = seat_token(client, headers, storage, course_id)

    r = client.get(
        f"/api/v1/courses/{course_id}/figures/{figure_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    # No published case study carries it yet: a 404, not a 403, so its existence
    # never leaks to a student.
    assert r.status_code == 404


def test_seat_resolves_a_published_figure(
    client: TestClient, tmp_path: Path, storage: FakeStorage
) -> None:
    headers = professor(client)
    course_id = make_course(client, headers)
    ensure_shard(client, headers, course_id)
    item_id, figure_id = seed_item_with_figure(tmp_path, course_id)
    _confirm_and_publish(client, headers, course_id, item_id)
    token = seat_token(client, headers, storage, course_id)

    r = client.get(
        f"/api/v1/courses/{course_id}/figures/{figure_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["image_url"].endswith("figures/h.jpeg")


def test_seat_scoped_to_another_course_is_403(
    client: TestClient, tmp_path: Path, storage: FakeStorage
) -> None:
    headers = professor(client)
    course_id = make_course(client, headers)
    ensure_shard(client, headers, course_id)
    _item, figure_id = seed_item_with_figure(tmp_path, course_id)
    other = make_course(client, headers)
    ensure_shard(client, headers, other)
    token = seat_token(client, headers, storage, other)

    r = client.get(
        f"/api/v1/courses/{course_id}/figures/{figure_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 403  # this is not the seat's course
