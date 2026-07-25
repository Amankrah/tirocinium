"""Milestone 4.4 (backend): the item verbs merge and discard, the confirmation
surface's last two (decision 0034). Merge folds a sibling the segmenter split
back into one item (its text appended, its figures moved, the source retired as
`merged`); discard drops a spurious item from the review. Both are link-and-state
edits: no figure is re-cropped and no bytes change. Items and figures are seeded
straight into the shard, as the confirm and figure-verb suites do."""

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
    assert (
        client.get(f"/api/v1/courses/{course_id}/case-studies", headers=headers).status_code
        == 200
    )


class Seeded:
    def __init__(self, job: int, item1: int, item2: int, fig1: int, fig2: int) -> None:
        self.job = job
        self.item1 = item1
        self.item2 = item2
        self.fig1 = fig1
        self.fig2 = fig2


def seed(tmp_path: Path, course_id: int, *, with_solutions: bool = False) -> Seeded:
    """A ready job with two pending items the segmenter split: item1 (page 3,
    confidence 0.9) carries fig1 essential; item2 (page 4, confidence 0.7) carries
    fig1 decorative and fig2 essential. The overlap on fig1 lets a merge test that
    the survivor's role wins and the link dedups."""
    conn = connect(tmp_path / "courses" / f"{course_id}.db")
    try:
        job = int(
            conn.execute(
                "INSERT INTO import_jobs (course_id, storage_key, status, created_at)"
                " VALUES (?, 'k', 'ready', 0)",
                (course_id,),
            ).lastrowid
            or 0
        )

        def figure(content_hash: str) -> int:
            return int(
                conn.execute(
                    "INSERT INTO figures (content_hash, storage_key, source, width_px,"
                    " height_px, created_at) VALUES (?, ?, 'embedded_raster', 10, 10, 0)",
                    (content_hash, f"imports/{course_id}/figures/{content_hash}.jpeg"),
                ).lastrowid
                or 0
            )

        fig1, fig2 = figure("h1"), figure("h2")

        def item(question: str, page_span: str, confidence: float, solution: str | None) -> int:
            solution_z = (
                None if solution is None else compress_text(conn, "problem_text", solution)
            )
            return int(
                conn.execute(
                    "INSERT INTO import_items (job_id, question_z, solution_z, page_span,"
                    " confidence, model_id, prompt_version, state)"
                    " VALUES (?, ?, ?, ?, ?, 'm', 'v1', 'pending')",
                    (
                        job,
                        compress_text(conn, "problem_text", question),
                        solution_z,
                        page_span,
                        confidence,
                    ),
                ).lastrowid
                or 0
            )

        item1 = item("Part one. ![f](fig://x)", "3", 0.9, "First half." if with_solutions else None)
        item2 = item("Part two.", "4", 0.7, "Second half." if with_solutions else None)
        conn.executemany(
            "INSERT INTO item_figures (item_id, figure_id, role) VALUES (?, ?, ?)",
            [
                (item1, fig1, "essential"),
                (item2, fig1, "decorative"),
                (item2, fig2, "essential"),
            ],
        )
        conn.execute(
            "INSERT INTO import_pages (job_id, page_index, kind, image_key, content_hash)"
            " VALUES (?, 0, 'scanned', ?, 'ph')",
            (job, f"imports/{course_id}/scan/0.png"),
        )
        return Seeded(job, item1, item2, fig1, fig2)
    finally:
        conn.close()


def state_of(tmp_path: Path, course_id: int, item_id: int) -> str:
    conn = connect(tmp_path / "courses" / f"{course_id}.db")
    try:
        return str(
            conn.execute(
                "SELECT state FROM import_items WHERE id = ?", (item_id,)
            ).fetchone()[0]
        )
    finally:
        conn.close()


def figures_of(tmp_path: Path, course_id: int, item_id: int) -> list[tuple[int, str]]:
    conn = connect(tmp_path / "courses" / f"{course_id}.db")
    try:
        rows = conn.execute(
            "SELECT figure_id, role FROM item_figures WHERE item_id = ? ORDER BY figure_id",
            (item_id,),
        ).fetchall()
        return [(int(a), str(b)) for a, b in rows]
    finally:
        conn.close()


def items_read(
    client: TestClient, headers: dict[str, str], course_id: int, job: int
) -> list[dict[str, Any]]:
    r = client.get(f"/api/v1/courses/{course_id}/imports/{job}/items", headers=headers)
    assert r.status_code == 200, r.text
    return list(r.json()["items"])


def _base(
    client: TestClient, tmp_path: Path, *, with_solutions: bool = False
) -> tuple[dict[str, str], int, Seeded]:
    headers = professor(client)
    course_id = make_course(client, headers)
    ensure_shard(client, headers, course_id)
    return headers, course_id, seed(tmp_path, course_id, with_solutions=with_solutions)


# ---------------------------------------------------------------------- merge


def test_merge_appends_text_and_moves_figures(client: TestClient, tmp_path: Path) -> None:
    headers, course_id, s = _base(client, tmp_path)

    r = client.post(
        f"/api/v1/courses/{course_id}/import-items/{s.item1}/merge",
        json={"source_item_id": s.item2},
        headers=headers,
    )

    assert r.status_code == 200, r.text
    body = r.json()
    assert body["survivor_id"] == s.item1
    assert body["merged_item_id"] == s.item2
    assert "Part one." in body["question_md"] and "Part two." in body["question_md"]
    assert body["question_md"].index("Part one.") < body["question_md"].index("Part two.")
    # The span spans both pages, the confidence is the least-confident half.
    assert body["page_span"] == "3, 4"
    assert body["confidence"] == 0.7

    # The source is retired and gone from the review; the survivor holds the union
    # of figures with its own role winning the fig1 clash, deduped.
    assert state_of(tmp_path, course_id, s.item2) == "merged"
    assert figures_of(tmp_path, course_id, s.item1) == [
        (s.fig1, "essential"),
        (s.fig2, "essential"),
    ]
    assert figures_of(tmp_path, course_id, s.item2) == []
    listed = items_read(client, headers, course_id, s.job)
    assert [item["id"] for item in listed] == [s.item1]
    assert {f["figure_id"] for f in listed[0]["figures"]} == {s.fig1, s.fig2}


def test_merge_combines_solutions(client: TestClient, tmp_path: Path) -> None:
    headers, course_id, s = _base(client, tmp_path, with_solutions=True)
    r = client.post(
        f"/api/v1/courses/{course_id}/import-items/{s.item1}/merge",
        json={"source_item_id": s.item2},
        headers=headers,
    )
    assert r.status_code == 200, r.text
    solution = r.json()["solution_md"]
    assert "First half." in solution and "Second half." in solution


def test_merge_retry_is_refused(client: TestClient, tmp_path: Path) -> None:
    headers, course_id, s = _base(client, tmp_path)
    first = client.post(
        f"/api/v1/courses/{course_id}/import-items/{s.item1}/merge",
        json={"source_item_id": s.item2},
        headers=headers,
    )
    assert first.status_code == 200
    # A double-submit finds the source already merged: 409, not a second append.
    retry = client.post(
        f"/api/v1/courses/{course_id}/import-items/{s.item1}/merge",
        json={"source_item_id": s.item2},
        headers=headers,
    )
    assert retry.status_code == 409


def test_merge_into_self_is_400(client: TestClient, tmp_path: Path) -> None:
    headers, course_id, s = _base(client, tmp_path)
    r = client.post(
        f"/api/v1/courses/{course_id}/import-items/{s.item1}/merge",
        json={"source_item_id": s.item1},
        headers=headers,
    )
    assert r.status_code == 400


def test_merge_missing_source_is_404(client: TestClient, tmp_path: Path) -> None:
    headers, course_id, s = _base(client, tmp_path)
    r = client.post(
        f"/api/v1/courses/{course_id}/import-items/{s.item1}/merge",
        json={"source_item_id": 999999},
        headers=headers,
    )
    assert r.status_code == 404


def test_merge_confirmed_source_is_409(client: TestClient, tmp_path: Path) -> None:
    headers, course_id, s = _base(client, tmp_path)
    assert (
        client.post(
            f"/api/v1/courses/{course_id}/import-items/{s.item2}/confirm", headers=headers
        ).status_code
        == 200
    )
    r = client.post(
        f"/api/v1/courses/{course_id}/import-items/{s.item1}/merge",
        json={"source_item_id": s.item2},
        headers=headers,
    )
    assert r.status_code == 409


def test_merge_non_owner_is_403(client: TestClient, tmp_path: Path) -> None:
    _headers, course_id, s = _base(client, tmp_path)
    other = professor(client, email="other@example.edu")
    r = client.post(
        f"/api/v1/courses/{course_id}/import-items/{s.item1}/merge",
        json={"source_item_id": s.item2},
        headers=other,
    )
    assert r.status_code == 403


# -------------------------------------------------------------------- discard


def test_discard_removes_item_from_the_review(client: TestClient, tmp_path: Path) -> None:
    headers, course_id, s = _base(client, tmp_path)
    r = client.post(
        f"/api/v1/courses/{course_id}/import-items/{s.item2}/discard", headers=headers
    )
    assert r.status_code == 204
    assert state_of(tmp_path, course_id, s.item2) == "discarded"
    listed = items_read(client, headers, course_id, s.job)
    assert [item["id"] for item in listed] == [s.item1]


def test_discard_is_idempotent(client: TestClient, tmp_path: Path) -> None:
    headers, course_id, s = _base(client, tmp_path)
    url = f"/api/v1/courses/{course_id}/import-items/{s.item2}/discard"
    assert client.post(url, headers=headers).status_code == 204
    assert client.post(url, headers=headers).status_code == 204


def test_discard_confirmed_is_409(client: TestClient, tmp_path: Path) -> None:
    headers, course_id, s = _base(client, tmp_path)
    assert (
        client.post(
            f"/api/v1/courses/{course_id}/import-items/{s.item1}/confirm", headers=headers
        ).status_code
        == 200
    )
    r = client.post(
        f"/api/v1/courses/{course_id}/import-items/{s.item1}/discard", headers=headers
    )
    assert r.status_code == 409


def test_discard_missing_is_404(client: TestClient, tmp_path: Path) -> None:
    headers, course_id, _s = _base(client, tmp_path)
    r = client.post(
        f"/api/v1/courses/{course_id}/import-items/999999/discard", headers=headers
    )
    assert r.status_code == 404


def test_confirm_rejects_a_discarded_item(client: TestClient, tmp_path: Path) -> None:
    headers, course_id, s = _base(client, tmp_path)
    assert (
        client.post(
            f"/api/v1/courses/{course_id}/import-items/{s.item2}/discard", headers=headers
        ).status_code
        == 204
    )
    r = client.post(
        f"/api/v1/courses/{course_id}/import-items/{s.item2}/confirm", headers=headers
    )
    assert r.status_code == 409


def test_discard_non_owner_is_403(client: TestClient, tmp_path: Path) -> None:
    _headers, course_id, s = _base(client, tmp_path)
    other = professor(client, email="other@example.edu")
    r = client.post(
        f"/api/v1/courses/{course_id}/import-items/{s.item2}/discard", headers=other
    )
    assert r.status_code == 403
