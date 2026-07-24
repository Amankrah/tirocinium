"""Milestone 4.4 (backend): the figure verbs the confirmation surface drives.
Mark a figure decorative, reassign it between items, unassign it, and add one
the detectors missed by drawing a box (a raster crop of the page). Items,
figures, and pages are seeded straight into the shard; the add-box crop runs the
real pure-image `crop_figures`."""

import io
import sqlite3
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.db.connection import connect
from app.main import create_app
from app.storage import IMPORTS_BUCKET, get_object_storage

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
        return "https://storage.test/unused"


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


def _png(width: int, height: int) -> bytes:
    from PIL import Image

    buffer = io.BytesIO()
    Image.new("RGB", (width, height), (180, 180, 180)).save(buffer, "PNG")
    return buffer.getvalue()


def seed(tmp_path: Path, course_id: int) -> tuple[int, int, int]:
    """A job with two items (item1 holds one figure) and one page whose raster is
    in storage. Returns (item1, item2, figure_id)."""
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

        def item() -> int:
            cur = conn.execute(
                "INSERT INTO import_items (job_id, question_z, page_span, confidence,"
                " model_id, prompt_version, state)"
                " VALUES (?, X'00', '0', 0.9, 'm', 'v1', 'pending')",
                (job_id,),
            )
            return int(cur.lastrowid or 0)

        item1, item2 = item(), item()
        conn.execute(
            "INSERT INTO item_figures (item_id, figure_id, role) VALUES (?, ?, 'essential')",
            (item1, figure_id),
        )
        conn.execute(
            "INSERT INTO import_pages (job_id, page_index, kind, image_key, content_hash)"
            " VALUES (?, 0, 'scanned', ?, 'pagehash')",
            (job_id, f"imports/{course_id}/scan/0.png"),
        )
        return item1, item2, figure_id
    finally:
        conn.close()


def _links(tmp_path: Path, course_id: int) -> list[tuple[int, int, str]]:
    conn = connect(tmp_path / "courses" / f"{course_id}.db")
    try:
        rows = conn.execute(
            "SELECT item_id, figure_id, role FROM item_figures ORDER BY item_id, figure_id"
        ).fetchall()
        return [(int(a), int(b), str(c)) for a, b, c in rows]
    finally:
        conn.close()


def _base(client: TestClient, tmp_path: Path) -> tuple[dict[str, str], int, int, int, int]:
    headers = professor(client)
    course_id = make_course(client, headers)
    ensure_shard(client, headers, course_id)
    item1, item2, figure_id = seed(tmp_path, course_id)
    return headers, course_id, item1, item2, figure_id


def test_mark_decorative(client: TestClient, tmp_path: Path) -> None:
    headers, course_id, item1, _item2, figure_id = _base(client, tmp_path)
    r = client.put(
        f"/api/v1/courses/{course_id}/import-items/{item1}/figures/{figure_id}",
        json={"role": "decorative"},
        headers=headers,
    )
    assert r.status_code == 204
    assert _links(tmp_path, course_id) == [(item1, figure_id, "decorative")]


def test_reassign_between_items(client: TestClient, tmp_path: Path) -> None:
    headers, course_id, item1, item2, figure_id = _base(client, tmp_path)
    # Assign to item2, then remove from item1: the figure has moved.
    assert (
        client.put(
            f"/api/v1/courses/{course_id}/import-items/{item2}/figures/{figure_id}",
            headers=headers,
        ).status_code
        == 204
    )
    assert (
        client.delete(
            f"/api/v1/courses/{course_id}/import-items/{item1}/figures/{figure_id}",
            headers=headers,
        ).status_code
        == 204
    )
    assert _links(tmp_path, course_id) == [(item2, figure_id, "essential")]


def test_unassign_unknown_link_is_404(client: TestClient, tmp_path: Path) -> None:
    headers, course_id, _item1, item2, figure_id = _base(client, tmp_path)
    r = client.delete(
        f"/api/v1/courses/{course_id}/import-items/{item2}/figures/{figure_id}",
        headers=headers,
    )
    assert r.status_code == 404  # not assigned to item2


def test_assign_unknown_figure_is_404(client: TestClient, tmp_path: Path) -> None:
    headers, course_id, item1, _item2, _figure_id = _base(client, tmp_path)
    r = client.put(
        f"/api/v1/courses/{course_id}/import-items/{item1}/figures/999999", headers=headers
    )
    assert r.status_code == 404


def test_add_figure_from_a_box(
    client: TestClient, tmp_path: Path, storage: FakeStorage
) -> None:
    headers, course_id, item1, _item2, _figure_id = _base(client, tmp_path)
    storage.objects[(IMPORTS_BUCKET, f"imports/{course_id}/scan/0.png")] = _png(120, 90)

    r = client.post(
        f"/api/v1/courses/{course_id}/import-items/{item1}/figures/from-box",
        json={"page_index": 0, "bbox": [0.1, 0.2, 0.5, 0.3]},
        headers=headers,
    )

    assert r.status_code == 201, r.text
    new_id = r.json()["figure_id"]

    def read(conn: sqlite3.Connection) -> tuple[str, int]:
        source = str(
            conn.execute("SELECT source FROM figures WHERE id = ?", (new_id,)).fetchone()[0]
        )
        linked = int(
            conn.execute(
                "SELECT COUNT(*) FROM item_figures WHERE item_id = ? AND figure_id = ?",
                (item1, new_id),
            ).fetchone()[0]
        )
        return source, linked

    conn = connect(tmp_path / "courses" / f"{course_id}.db")
    try:
        source, linked = read(conn)
    finally:
        conn.close()
    assert source == "page_crop"
    assert linked == 1
    # The crop (0.5*120 x 0.3*90 = 60x27) is stored content-addressed.
    assert any(k[1].endswith(".png") and "figures/" in k[1] for k in storage.objects)


def test_add_from_box_unknown_page_is_404(client: TestClient, tmp_path: Path) -> None:
    headers, course_id, item1, _item2, _figure_id = _base(client, tmp_path)
    r = client.post(
        f"/api/v1/courses/{course_id}/import-items/{item1}/figures/from-box",
        json={"page_index": 9, "bbox": [0.1, 0.2, 0.5, 0.3]},
        headers=headers,
    )
    assert r.status_code == 404


def test_non_owner_cannot_use_the_verbs(client: TestClient, tmp_path: Path) -> None:
    _headers, course_id, item1, _item2, figure_id = _base(client, tmp_path)
    other = professor(client, email="other@example.edu")
    r = client.put(
        f"/api/v1/courses/{course_id}/import-items/{item1}/figures/{figure_id}",
        headers=other,
    )
    assert r.status_code == 403
