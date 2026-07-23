"""Milestone 3.1: the handwritten solution upload path. Presigned
direct-to-storage upload URLs, server-enforced page and size limits, the
completed-manifest handshake, idempotency on the creating call, and the
seat-only authorization property (a seat reads only its own submissions)."""

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
MB = 1024 * 1024


class FakeObjectStorage:
    def __init__(self) -> None:
        self.objects: dict[tuple[str, str], bytes] = {}
        self.presigned: list[tuple[str, str, int]] = []  # (method, key, expires)

    def create_bucket(self, *, Bucket: str) -> object:
        return {}

    def put_object(self, *, Bucket: str, Key: str, Body: Any) -> object:
        data = Body.read() if hasattr(Body, "read") else bytes(Body)
        self.objects[(Bucket, Key)] = data
        return {}

    def generate_presigned_url(
        self, ClientMethod: str, Params: dict[str, str], ExpiresIn: int
    ) -> str:
        self.presigned.append((ClientMethod, Params["Key"], ExpiresIn))
        return f"https://storage.test/{Params['Bucket']}/{Params['Key']}?m={ClientMethod}"


@pytest.fixture()
def storage() -> FakeObjectStorage:
    return FakeObjectStorage()


@pytest.fixture()
def tmp_data(tmp_path: Path) -> Path:
    return tmp_path


@pytest.fixture()
def client(tmp_data: Path, storage: FakeObjectStorage) -> Iterator[TestClient]:
    app = create_app(data_dir=tmp_data, jwt_secret=SECRET)
    app.dependency_overrides[get_object_storage] = lambda: storage
    with TestClient(app) as c:
        yield c


# ------------------------------------------------------------------ helpers


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
        json={"title": "NPV", "body": "# NPV\n\nCompute it.\n"},
        headers=headers,
    )
    assert r.status_code == 201, r.text
    return int(r.json()["id"])


def seed_variant(tmp_data: Path, course_id: int, case_study_id: int) -> int:
    """Insert a verified variant straight into the course shard. Variants are
    born of publishing (Phase 5), which does not exist yet, so tests seed one
    directly, the same way seat tests read directory.db directly."""
    conn = connect(tmp_data / "courses" / f"{course_id}.db")
    try:
        cur = conn.execute(
            "INSERT INTO variants"
            " (case_study_id, seed_json_z, body_z, solution_z, verification,"
            "  model_id, created_at)"
            " VALUES (?, ?, ?, ?, 'verified', 'test-model', 1750000000)",
            (
                case_study_id,
                compress_text(conn, "problem_text", '{"seed": 1}'),
                compress_text(conn, "problem_text", "# variant body"),
                compress_text(conn, "problem_text", "worked solution"),
            ),
        )
        assert cur.lastrowid is not None
        return int(cur.lastrowid)
    finally:
        conn.close()


def seat_tokens(
    client: TestClient,
    headers: dict[str, str],
    course_id: int,
    storage: FakeObjectStorage,
    count: int = 1,
) -> list[str]:
    r = client.post(
        f"/api/v1/courses/{course_id}/seats", json={"count": count}, headers=headers
    )
    assert r.status_code == 201, r.text
    csv_bytes = next(
        data for (_, key), data in storage.objects.items() if key.endswith(".csv")
    )
    codes = [
        line.split(",")[1]
        for line in csv_bytes.decode().strip().splitlines()[1:]
    ]
    tokens = []
    for code in codes:
        redeemed = client.post("/api/v1/seats/redeem", json={"code": code})
        assert redeemed.status_code == 200, redeemed.text
        tokens.append(str(redeemed.json()["token"]))
    return tokens


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def prepared(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path, seats: int = 1
) -> tuple[int, int, list[str]]:
    """A published-course world with a seeded variant and redeemed seats."""
    headers = professor(client)
    course_id = make_course(client, headers)
    case_study_id = make_case_study(client, headers, course_id)
    variant_id = seed_variant(tmp_data, course_id, case_study_id)
    tokens = seat_tokens(client, headers, course_id, storage, count=seats)
    return variant_id, course_id, tokens


def request_upload(
    client: TestClient, token: str, variant_id: int, pages: list[dict[str, Any]] | None = None
) -> Any:
    if pages is None:
        pages = [{"content_type": "image/jpeg", "size_bytes": 2 * MB}]
    return client.post(
        f"/api/v1/variants/{variant_id}/submissions",
        json={"pages": pages},
        headers=bearer(token),
    )


# ---------------------------------------------------------------- upload URLs


def test_request_creates_pending_submission_with_urls(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    variant_id, _course_id, tokens = prepared(client, storage, tmp_data)
    r = request_upload(
        client,
        tokens[0],
        variant_id,
        pages=[
            {"content_type": "image/jpeg", "size_bytes": 2 * MB},
            {"content_type": "image/png", "size_bytes": 3 * MB},
        ],
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["status"] == "pending"
    assert len(body["uploads"]) == 2
    assert [u["page_index"] for u in body["uploads"]] == [0, 1]
    for upload in body["uploads"]:
        assert upload["storage_key"].startswith(body["storage_prefix"])
    # The upload URLs are presigned PUTs, short-lived. (Seat-code generation
    # also presigns get_object for its CSV/PDF, so filter to the puts.)
    puts = [(key, ttl) for method, key, ttl in storage.presigned if method == "put_object"]
    assert len(puts) == 2
    assert all(ttl <= 900 for _key, ttl in puts)


def test_upload_limits_are_enforced(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    variant_id, _course_id, tokens = prepared(client, storage, tmp_data)
    token = tokens[0]

    assert request_upload(client, token, variant_id, pages=[]).status_code == 422
    too_many = [{"content_type": "image/jpeg", "size_bytes": MB} for _ in range(26)]
    assert request_upload(client, token, variant_id, pages=too_many).status_code == 422
    oversize = [{"content_type": "image/jpeg", "size_bytes": 15 * MB + 1}]
    assert request_upload(client, token, variant_id, pages=oversize).status_code == 422
    bad_type = [{"content_type": "image/gif", "size_bytes": MB}]
    assert request_upload(client, token, variant_id, pages=bad_type).status_code == 422


def test_pdf_is_an_accepted_page_type(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    variant_id, _course_id, tokens = prepared(client, storage, tmp_data)
    r = request_upload(
        client,
        tokens[0],
        variant_id,
        pages=[{"content_type": "application/pdf", "size_bytes": 10 * MB}],
    )
    assert r.status_code == 201, r.text


def test_unknown_variant_is_404(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    _variant_id, _course_id, tokens = prepared(client, storage, tmp_data)
    assert request_upload(client, tokens[0], 999_999).status_code == 404


# --------------------------------------------------------------- idempotency


def test_idempotency_key_dedupes_the_create(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    variant_id, course_id, tokens = prepared(client, storage, tmp_data)
    headers = {**bearer(tokens[0]), "Idempotency-Key": "abc-123"}
    body = {"pages": [{"content_type": "image/jpeg", "size_bytes": MB}]}

    first = client.post(
        f"/api/v1/variants/{variant_id}/submissions", json=body, headers=headers
    )
    second = client.post(
        f"/api/v1/variants/{variant_id}/submissions", json=body, headers=headers
    )
    assert first.status_code == 201 and second.status_code == 201
    assert first.json()["submission_id"] == second.json()["submission_id"]

    conn = connect(tmp_data / "courses" / f"{course_id}.db", readonly=True)
    try:
        count = conn.execute("SELECT COUNT(*) FROM submissions").fetchone()[0]
    finally:
        conn.close()
    assert count == 1


# ------------------------------------------------------------------ complete


def test_complete_marks_uploaded(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    variant_id, _course_id, tokens = prepared(client, storage, tmp_data)
    submission_id = request_upload(client, tokens[0], variant_id).json()["submission_id"]

    done = client.post(
        f"/api/v1/submissions/{submission_id}/complete", headers=bearer(tokens[0])
    )
    assert done.status_code == 200, done.text
    assert done.json()["status"] == "uploaded"


def test_get_returns_status_and_pages(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    variant_id, _course_id, tokens = prepared(client, storage, tmp_data)
    pages = [
        {"content_type": "image/jpeg", "size_bytes": 2 * MB, "content_hash": "deadbeef"},
        {"content_type": "image/png", "size_bytes": 3 * MB},
    ]
    submission_id = request_upload(client, tokens[0], variant_id, pages=pages).json()[
        "submission_id"
    ]

    got = client.get(f"/api/v1/submissions/{submission_id}", headers=bearer(tokens[0]))
    assert got.status_code == 200, got.text
    body = got.json()
    assert body["status"] == "pending"
    assert body["page_count"] == 2
    assert body["variant_id"] == variant_id
    assert body["recognition_conf"] is None
    assert body["pages"][0]["content_hash"] == "deadbeef"


# ----------------------------------------------------- authorization property


def test_a_seat_cannot_read_or_complete_another_seats_submission(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    variant_id, _course_id, tokens = prepared(client, storage, tmp_data, seats=2)
    owner, other = tokens
    submission_id = request_upload(client, owner, variant_id).json()["submission_id"]

    assert (
        client.get(
            f"/api/v1/submissions/{submission_id}", headers=bearer(other)
        ).status_code
        == 404
    )
    assert (
        client.post(
            f"/api/v1/submissions/{submission_id}/complete", headers=bearer(other)
        ).status_code
        == 404
    )
    # The owner still reads it fine.
    assert (
        client.get(
            f"/api/v1/submissions/{submission_id}", headers=bearer(owner)
        ).status_code
        == 200
    )


def test_professor_jwt_rejected_on_submission_surfaces(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    variant_id, _course_id, tokens = prepared(client, storage, tmp_data)
    submission_id = request_upload(client, tokens[0], variant_id).json()["submission_id"]
    prof = professor(client, "another@example.edu")

    assert request_upload_as_prof(client, prof, variant_id).status_code == 403
    assert (
        client.get(f"/api/v1/submissions/{submission_id}", headers=prof).status_code
        == 403
    )


def request_upload_as_prof(
    client: TestClient, headers: dict[str, str], variant_id: int
) -> Any:
    return client.post(
        f"/api/v1/variants/{variant_id}/submissions",
        json={"pages": [{"content_type": "image/jpeg", "size_bytes": MB}]},
        headers=headers,
    )
