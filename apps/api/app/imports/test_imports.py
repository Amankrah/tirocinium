"""Milestone 4.1 import-endpoint tests: the professor-and-owner upload handshake
(create returns a presigned PDF URL, complete flips and enqueues decode, get
reports status), idempotency on create, the byte ceiling, and the authorization
surface (unauthenticated 401, unknown course 404, non-owner 403, a seat refused,
imports isolated across courses)."""

from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.db.connection import connect
from app.main import create_app
from app.storage import IMPORTS_BUCKET, get_object_storage
from app.tasks import get_task_queue

SECRET = "test-secret-not-for-production-0123"
PASSWORD = "a sensible passphrase"
MB = 1024 * 1024


class FakeObjectStorage:
    def __init__(self) -> None:
        self.objects: dict[tuple[str, str], bytes] = {}
        self.presigned: list[tuple[str, str, str]] = []  # (method, bucket, key)

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
        self.presigned.append((ClientMethod, Params["Bucket"], Params["Key"]))
        return f"https://storage.test/{Params['Bucket']}/{Params['Key']}"


class RecordingQueue:
    def __init__(self) -> None:
        self.imports: list[tuple[int, int]] = []

    async def enqueue_process_submission(self, course_id: int, submission_id: int) -> None:
        return None

    async def enqueue_process_import(self, course_id: int, import_id: int) -> None:
        self.imports.append((course_id, import_id))


@pytest.fixture()
def storage() -> FakeObjectStorage:
    return FakeObjectStorage()


@pytest.fixture()
def queue() -> RecordingQueue:
    return RecordingQueue()


@pytest.fixture()
def client(
    tmp_path: Path, storage: FakeObjectStorage, queue: RecordingQueue
) -> Iterator[TestClient]:
    app = create_app(data_dir=tmp_path, jwt_secret=SECRET)
    app.dependency_overrides[get_object_storage] = lambda: storage
    app.dependency_overrides[get_task_queue] = lambda: queue
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


def seat_token(
    client: TestClient, headers: dict[str, str], course_id: int, storage: FakeObjectStorage
) -> str:
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


def test_create_returns_a_presigned_pdf_upload(
    client: TestClient, storage: FakeObjectStorage
) -> None:
    headers = professor(client)
    course_id = make_course(client, headers)

    r = client.post(
        f"/api/v1/courses/{course_id}/imports",
        json={"content_type": "application/pdf", "size_bytes": 5 * MB},
        headers=headers,
    )

    assert r.status_code == 201, r.text
    body = r.json()
    assert body["status"] == "pending"
    assert body["storage_key"].startswith(f"imports/{course_id}/")
    assert body["storage_key"].endswith("/source.pdf")
    assert body["upload_url"].endswith(body["storage_key"])
    assert storage.presigned[-1][:2] == ("put_object", IMPORTS_BUCKET)


def test_oversized_pdf_is_rejected(client: TestClient) -> None:
    headers = professor(client)
    course_id = make_course(client, headers)
    r = client.post(
        f"/api/v1/courses/{course_id}/imports",
        json={"content_type": "application/pdf", "size_bytes": 61 * MB},
        headers=headers,
    )
    assert r.status_code == 422


def test_create_is_idempotent(client: TestClient) -> None:
    headers = professor(client)
    course_id = make_course(client, headers)
    payload = {"content_type": "application/pdf", "size_bytes": 3 * MB}
    key = {"Idempotency-Key": "abc-123"}

    first = client.post(
        f"/api/v1/courses/{course_id}/imports", json=payload, headers={**headers, **key}
    )
    second = client.post(
        f"/api/v1/courses/{course_id}/imports", json=payload, headers={**headers, **key}
    )

    assert first.status_code == second.status_code == 201
    assert first.json()["import_id"] == second.json()["import_id"]
    assert first.json()["storage_key"] == second.json()["storage_key"]


def test_complete_enqueues_decode_once(
    client: TestClient, queue: RecordingQueue
) -> None:
    headers = professor(client)
    course_id = make_course(client, headers)
    import_id = client.post(
        f"/api/v1/courses/{course_id}/imports",
        json={"content_type": "application/pdf", "size_bytes": MB},
        headers=headers,
    ).json()["import_id"]

    first = client.post(
        f"/api/v1/courses/{course_id}/imports/{import_id}/complete", headers=headers
    )
    second = client.post(
        f"/api/v1/courses/{course_id}/imports/{import_id}/complete", headers=headers
    )

    assert first.status_code == 200
    assert first.json()["status"] == "uploaded"
    assert second.status_code == 200  # a re-complete is a no-op
    assert queue.imports == [(course_id, import_id)]  # enqueued exactly once


def test_get_reports_status(client: TestClient) -> None:
    headers = professor(client)
    course_id = make_course(client, headers)
    import_id = client.post(
        f"/api/v1/courses/{course_id}/imports",
        json={"content_type": "application/pdf", "size_bytes": MB},
        headers=headers,
    ).json()["import_id"]

    r = client.get(f"/api/v1/courses/{course_id}/imports/{import_id}", headers=headers)

    assert r.status_code == 200
    assert r.json() == {
        "id": import_id,
        "status": "pending",
        "page_count": None,
        "pages_done": 0,
        "stage": None,
        "created_at": r.json()["created_at"],
    }


def _processing_job(
    tmp_path: Path, course_id: int, import_id: int, *, page_count: int, pages_done: int
) -> None:
    conn = connect(tmp_path / "courses" / f"{course_id}.db")
    try:
        conn.execute(
            "UPDATE import_jobs SET status = 'processing', page_count = ? WHERE id = ?",
            (page_count, import_id),
        )
        for index in range(pages_done):
            conn.execute(
                "INSERT INTO import_pages (job_id, page_index, kind, image_key,"
                " content_hash) VALUES (?, ?, 'born_digital', ?, ?)",
                (import_id, index, f"img/{index}.png", f"hash-{index}"),
            )
    finally:
        conn.close()


def test_get_reports_reading_progress(
    client: TestClient, tmp_path: Path
) -> None:
    headers = professor(client)
    course_id = make_course(client, headers)
    import_id = client.post(
        f"/api/v1/courses/{course_id}/imports",
        json={"content_type": "application/pdf", "size_bytes": MB},
        headers=headers,
    ).json()["import_id"]
    _processing_job(tmp_path, course_id, import_id, page_count=9, pages_done=3)

    r = client.get(f"/api/v1/courses/{course_id}/imports/{import_id}", headers=headers)

    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "processing"
    assert body["page_count"] == 9
    assert body["pages_done"] == 3
    assert body["stage"] == "reading"


def test_get_reports_segmenting_when_every_page_is_in(
    client: TestClient, tmp_path: Path
) -> None:
    headers = professor(client)
    course_id = make_course(client, headers)
    import_id = client.post(
        f"/api/v1/courses/{course_id}/imports",
        json={"content_type": "application/pdf", "size_bytes": MB},
        headers=headers,
    ).json()["import_id"]
    _processing_job(tmp_path, course_id, import_id, page_count=9, pages_done=9)

    r = client.get(f"/api/v1/courses/{course_id}/imports/{import_id}", headers=headers)

    assert r.status_code == 200
    assert r.json()["stage"] == "segmenting"
    assert r.json()["pages_done"] == 9


def test_import_requires_authentication(client: TestClient) -> None:
    headers = professor(client)
    course_id = make_course(client, headers)
    r = client.post(
        f"/api/v1/courses/{course_id}/imports",
        json={"content_type": "application/pdf", "size_bytes": MB},
    )
    assert r.status_code == 401


def test_non_owner_cannot_import(client: TestClient) -> None:
    owner = professor(client)
    course_id = make_course(client, owner)
    other = professor(client, email="other@example.edu")
    r = client.post(
        f"/api/v1/courses/{course_id}/imports",
        json={"content_type": "application/pdf", "size_bytes": MB},
        headers=other,
    )
    assert r.status_code == 403


def test_a_seat_cannot_import(
    client: TestClient, storage: FakeObjectStorage
) -> None:
    headers = professor(client)
    course_id = make_course(client, headers)
    token = seat_token(client, headers, course_id, storage)
    r = client.post(
        f"/api/v1/courses/{course_id}/imports",
        json={"content_type": "application/pdf", "size_bytes": MB},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code in (401, 403)


def test_import_of_another_course_is_not_visible(client: TestClient) -> None:
    headers = professor(client)
    course_a = make_course(client, headers)
    course_b = make_course(client, headers)
    import_id = client.post(
        f"/api/v1/courses/{course_a}/imports",
        json={"content_type": "application/pdf", "size_bytes": MB},
        headers=headers,
    ).json()["import_id"]

    # Same owner, but the import lives in course A's shard, so course B does not
    # see it (per-shard ids do not cross, decision 0013).
    r = client.get(f"/api/v1/courses/{course_b}/imports/{import_id}", headers=headers)
    assert r.status_code == 404
