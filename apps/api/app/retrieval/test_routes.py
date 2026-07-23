"""Milestone 3.4 search-endpoint tests: the authorization surface (a professor
owner searches; an unknown course is 404, a non-owner 403, an unauthenticated
caller 401, and a seat is refused because students never search) and the happy
path returning a fused hit. The submission is indexed by seeding the shard
directly (FTS row and a quantized embedding), the same way the seat and
submission suites seed variants directly, so the test never runs the worker."""

import struct
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from platform_core import embedding

from app.compression import compress_bytes, compress_text
from app.db.connection import connect
from app.main import create_app
from app.retrieval.model import RecordedEmbedder, get_embedder
from app.storage import get_object_storage

SECRET = "test-secret-not-for-production-0123"
PASSWORD = "a sensible passphrase"
TEXT = "the annuity approach discounts each future payment"
QUERY = "annuity discount"


class FakeObjectStorage:
    def __init__(self) -> None:
        self.objects: dict[tuple[str, str], bytes] = {}

    def create_bucket(self, *, Bucket: str) -> object:
        return {}

    def put_object(self, *, Bucket: str, Key: str, Body: Any) -> object:
        self.objects[(Bucket, Key)] = Body.read() if hasattr(Body, "read") else bytes(Body)
        return {}

    def get_object(self, *, Bucket: str, Key: str) -> Any:
        import io

        return {"Body": io.BytesIO(self.objects[(Bucket, Key)])}

    def generate_presigned_url(
        self, ClientMethod: str, Params: dict[str, str], ExpiresIn: int
    ) -> str:
        return f"https://storage.test/{Params['Bucket']}/{Params['Key']}"


@pytest.fixture()
def storage() -> FakeObjectStorage:
    return FakeObjectStorage()


@pytest.fixture()
def client(tmp_path: Path, storage: FakeObjectStorage) -> Iterator[TestClient]:
    app = create_app(data_dir=tmp_path, jwt_secret=SECRET)
    app.dependency_overrides[get_object_storage] = lambda: storage
    # The query embedder is recorded, so the endpoint never calls a live model.
    app.dependency_overrides[get_embedder] = lambda: RecordedEmbedder.for_texts(
        {QUERY: [0.9, 0.1, 0.0, 0.0]}
    )
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


def make_case_study(client: TestClient, headers: dict[str, str], course_id: int) -> int:
    r = client.post(
        f"/api/v1/courses/{course_id}/case-studies",
        json={"title": "NPV", "body": "# NPV\n"},
        headers=headers,
    )
    assert r.status_code == 201, r.text
    return int(r.json()["id"])


def seed_indexed_submission(tmp_data: Path, course_id: int, case_study_id: int) -> int:
    """Insert a verified variant, a processed submission with recognized text,
    and its FTS and embedding index rows straight into the shard."""
    conn = connect(tmp_data / "courses" / f"{course_id}.db")
    try:
        variant = conn.execute(
            "INSERT INTO variants (case_study_id, seed_json_z, body_z, solution_z,"
            " verification, model_id, created_at)"
            " VALUES (?, ?, ?, ?, 'verified', 'm', 0)",
            (
                case_study_id,
                compress_text(conn, "problem_text", "{}"),
                compress_text(conn, "problem_text", "b"),
                compress_text(conn, "problem_text", "s"),
            ),
        )
        submission = conn.execute(
            "INSERT INTO submissions (variant_id, seat_id, page_count, storage_prefix,"
            " recognized_z, recognition_conf, status, submitted_at)"
            " VALUES (?, 1, 1, 'p', ?, 0.9, 'processed', 0)",
            (variant.lastrowid, compress_text(conn, "handwriting", TEXT)),
        )
        submission_id = submission.lastrowid
        assert submission_id is not None
        codes, scale = embedding.quantize([1.0, 0.0, 0.0, 0.0])
        vec_f32_z = compress_bytes(struct.pack("<4f", 1.0, 0.0, 0.0, 0.0))
        conn.execute(
            "INSERT INTO search_fts (content, kind, ref_id) VALUES (?, 'submission', ?)",
            (TEXT, submission_id),
        )
        conn.execute(
            "INSERT INTO embeddings (ref_kind, ref_id, vec_i8, scale, vec_f32_z, model_id)"
            " VALUES ('submission', ?, ?, ?, ?, 'text-embedding-3-small')",
            (submission_id, codes, scale, vec_f32_z),
        )
        return int(submission_id)
    finally:
        conn.close()


def seat_token(client: TestClient, headers: dict[str, str], course_id: int,
               storage: FakeObjectStorage) -> str:
    r = client.post(
        f"/api/v1/courses/{course_id}/seats", json={"count": 1}, headers=headers
    )
    assert r.status_code == 201, r.text
    csv_bytes = next(
        data for (_, key), data in storage.objects.items() if key.endswith(".csv")
    )
    code = csv_bytes.decode().strip().splitlines()[1].split(",")[1]
    redeemed = client.post("/api/v1/seats/redeem", json={"code": code})
    assert redeemed.status_code == 200, redeemed.text
    return str(redeemed.json()["token"])


def test_owner_searches_and_gets_a_fused_hit(
    client: TestClient, storage: FakeObjectStorage, tmp_path: Path
) -> None:
    headers = professor(client)
    course_id = make_course(client, headers)
    case_study_id = make_case_study(client, headers, course_id)
    submission_id = seed_indexed_submission(tmp_path, course_id, case_study_id)

    r = client.get(
        f"/api/v1/courses/{course_id}/search", params={"q": QUERY}, headers=headers
    )

    assert r.status_code == 200, r.text
    body = r.json()
    assert body["query"] == QUERY
    assert body["hits"], "expected a hit"
    top = body["hits"][0]
    assert top["submission_id"] == submission_id
    assert top["status"] == "processed"
    assert "annuity" in top["snippet"]


def test_search_requires_authentication(client: TestClient) -> None:
    headers = professor(client)
    course_id = make_course(client, headers)
    r = client.get(f"/api/v1/courses/{course_id}/search", params={"q": QUERY})
    assert r.status_code == 401


def test_search_on_unknown_course_is_404(client: TestClient) -> None:
    headers = professor(client)
    r = client.get("/api/v1/courses/999999/search", params={"q": QUERY}, headers=headers)
    assert r.status_code == 404


def test_non_owner_professor_is_forbidden(client: TestClient) -> None:
    owner = professor(client)
    course_id = make_course(client, owner)
    other = professor(client, email="other@example.edu")
    r = client.get(
        f"/api/v1/courses/{course_id}/search", params={"q": QUERY}, headers=other
    )
    assert r.status_code == 403


def test_a_seat_cannot_search(
    client: TestClient, storage: FakeObjectStorage
) -> None:
    headers = professor(client)
    course_id = make_course(client, headers)
    token = seat_token(client, headers, course_id, storage)
    r = client.get(
        f"/api/v1/courses/{course_id}/search",
        params={"q": QUERY},
        headers={"Authorization": f"Bearer {token}"},
    )
    # Students never search: a seat token is not a professor credential here.
    assert r.status_code in (401, 403)


def test_query_is_required(client: TestClient) -> None:
    headers = professor(client)
    course_id = make_course(client, headers)
    r = client.get(f"/api/v1/courses/{course_id}/search", headers=headers)
    assert r.status_code == 422
