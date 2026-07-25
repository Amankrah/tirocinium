"""Milestone 5.3: the variant surface. Requesting generation enqueues seeded
jobs (idempotently under a key), the professor reads states and the flagged
diff, and the review-queue verbs (promote, edit, discard) follow the
propose-and-dispose shape. Students never touch this surface."""

import io
import json
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.compression import compress_text
from app.db.connection import connect
from app.main import create_app
from app.storage import get_object_storage
from app.tasks import get_task_queue

SECRET = "test-secret-not-for-production-0123"
PASSWORD = "a sensible passphrase"

SPEC_JSON = json.dumps(
    {
        "parameters": {
            "rate": {"type": "number", "base": 0.08, "range": [0.04, 0.12]}
        },
        "invariants": [],
        "solution_method": None,
    }
)


class FakeStorage:
    def __init__(self) -> None:
        self.objects: dict[tuple[str, str], bytes] = {}

    def create_bucket(self, *, Bucket: str) -> object:
        return {}

    def put_object(self, *, Bucket: str, Key: str, Body: Any) -> object:
        self.objects[(Bucket, Key)] = (
            Body.read() if hasattr(Body, "read") else bytes(Body)
        )
        return {}

    def get_object(self, *, Bucket: str, Key: str) -> Any:
        return {"Body": io.BytesIO(self.objects[(Bucket, Key)])}

    def generate_presigned_url(
        self, ClientMethod: str, Params: dict[str, str], ExpiresIn: int
    ) -> str:
        return f"https://storage.test/{Params['Key']}"


class RecordingQueue:
    def __init__(self) -> None:
        self.generated: list[tuple[int, int, int]] = []

    async def enqueue_process_submission(
        self, course_id: int, submission_id: int
    ) -> None:
        return None

    async def enqueue_process_import(self, course_id: int, import_id: int) -> None:
        return None

    async def enqueue_generate_variant(
        self, course_id: int, case_study_id: int, seed: int
    ) -> None:
        self.generated.append((course_id, case_study_id, seed))


@pytest.fixture()
def storage() -> FakeStorage:
    return FakeStorage()


@pytest.fixture()
def queue() -> RecordingQueue:
    return RecordingQueue()


@pytest.fixture()
def client(
    tmp_path: Path, storage: FakeStorage, queue: RecordingQueue
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


def make_case_study(
    client: TestClient,
    headers: dict[str, str],
    tmp_path: Path,
    *,
    with_spec: bool = True,
) -> tuple[int, int]:
    r = client.post("/api/v1/courses", json={"title": "FDSC 315"}, headers=headers)
    course_id = int(r.json()["id"])
    r = client.post(
        f"/api/v1/courses/{course_id}/case-studies",
        json={"title": "NPV", "body": "Compute the NPV at 0.08."},
        headers=headers,
    )
    case_study_id = int(r.json()["id"])
    if with_spec:
        conn = connect(tmp_path / "courses" / f"{course_id}.db")
        try:
            conn.execute(
                "UPDATE case_studies SET param_spec_z = ? WHERE id = ?",
                (compress_text(conn, "problem_text", SPEC_JSON), case_study_id),
            )
        finally:
            conn.close()
    return course_id, case_study_id


def seed_variant(
    tmp_path: Path,
    course_id: int,
    case_study_id: int,
    *,
    seed: int = 1,
    verification: str = "flagged",
    flag_reason: str | None = "The independent re-solve disagrees with the solution.",
) -> int:
    conn = connect(tmp_path / "courses" / f"{course_id}.db")
    try:
        solution = json.dumps(
            {"solution_md": "I = V/R.", "final_answers": ["2.553 mA"]}
        )
        cursor = conn.execute(
            "INSERT INTO variants (case_study_id, seed, seed_json_z, body_z,"
            " solution_z, verification, flag_reason, model_id, verify_model_id,"
            " generation_prompt_version, verification_prompt_version,"
            " verify_solution_z, created_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, 'm', 'm2', 'variant-generation/v1',"
            " 'variant-verification/v1', ?, 0)",
            (
                case_study_id,
                seed,
                compress_text(conn, "problem_text", json.dumps({"rate": 0.06})),
                compress_text(conn, "problem_text", "A variant body."),
                compress_text(conn, "problem_text", solution),
                verification,
                flag_reason,
                compress_text(conn, "problem_text", "A different working."),
            ),
        )
        return int(cursor.lastrowid or 0)
    finally:
        conn.close()


def test_requesting_variants_enqueues_seeded_jobs(
    client: TestClient, tmp_path: Path, queue: RecordingQueue
) -> None:
    headers = professor(client)
    course_id, case_study_id = make_case_study(client, headers, tmp_path)

    r = client.post(
        f"/api/v1/courses/{course_id}/case-studies/{case_study_id}/variants",
        json={"count": 3},
        headers=headers,
    )

    assert r.status_code == 202, r.text
    body = r.json()
    assert body["enqueued"] == 3
    assert len(set(body["seeds"])) == 3
    assert [
        (course, case) for course, case, _ in queue.generated
    ] == [(course_id, case_study_id)] * 3


def test_a_retry_with_the_same_key_enqueues_the_same_seeds(
    client: TestClient, tmp_path: Path, queue: RecordingQueue
) -> None:
    headers = professor(client)
    course_id, case_study_id = make_case_study(client, headers, tmp_path)
    with_key = {**headers, "Idempotency-Key": "gen-1"}

    first = client.post(
        f"/api/v1/courses/{course_id}/case-studies/{case_study_id}/variants",
        json={"count": 2},
        headers=with_key,
    )
    second = client.post(
        f"/api/v1/courses/{course_id}/case-studies/{case_study_id}/variants",
        json={"count": 2},
        headers=with_key,
    )

    # Deterministic seeds from the key: the retry enqueues the same jobs, and
    # the broker's per-seed job id plus the unique index collapse them.
    assert first.json()["seeds"] == second.json()["seeds"]


def test_without_a_spec_generation_is_refused(
    client: TestClient, tmp_path: Path
) -> None:
    headers = professor(client)
    course_id, case_study_id = make_case_study(
        client, headers, tmp_path, with_spec=False
    )
    r = client.post(
        f"/api/v1/courses/{course_id}/case-studies/{case_study_id}/variants",
        json={},
        headers=headers,
    )
    assert r.status_code == 409
    assert "parameter spec" in r.json()["detail"]


def test_listing_filters_by_state(client: TestClient, tmp_path: Path) -> None:
    headers = professor(client)
    course_id, case_study_id = make_case_study(client, headers, tmp_path)
    seed_variant(
        tmp_path, course_id, case_study_id, seed=1, verification="verified",
        flag_reason=None,
    )
    flagged_id = seed_variant(
        tmp_path, course_id, case_study_id, seed=2, verification="flagged"
    )

    url = f"/api/v1/courses/{course_id}/case-studies/{case_study_id}/variants"
    everything = client.get(url, headers=headers).json()["items"]
    assert [v["verification"] for v in everything] == ["verified", "flagged"]
    review_queue = client.get(
        url, params={"state": "flagged"}, headers=headers
    ).json()["items"]
    assert [v["id"] for v in review_queue] == [flagged_id]
    assert "disagrees" in review_queue[0]["flag_reason"]
    assert (
        client.get(url, params={"state": "nonsense"}, headers=headers).status_code
        == 400
    )


def test_the_detail_read_serves_the_flagged_diff(
    client: TestClient, tmp_path: Path
) -> None:
    headers = professor(client)
    course_id, case_study_id = make_case_study(client, headers, tmp_path)
    variant_id = seed_variant(tmp_path, course_id, case_study_id)

    r = client.get(
        f"/api/v1/courses/{course_id}/variants/{variant_id}", headers=headers
    )

    assert r.status_code == 200, r.text
    body = r.json()
    assert body["body"] == "A variant body."
    assert body["solution"] == "I = V/R."  # the generation pass's solution
    assert body["verify_solution"] == "A different working."  # the re-solve's
    assert body["final_answers"] == ["2.553 mA"]
    assert body["values"] == {"rate": 0.06}
    assert body["generation_prompt_version"] == "variant-generation/v1"
    assert body["verify_model_id"] == "m2"


def test_promote_is_the_professor_overriding_a_flag(
    client: TestClient, tmp_path: Path
) -> None:
    headers = professor(client)
    course_id, case_study_id = make_case_study(client, headers, tmp_path)
    variant_id = seed_variant(tmp_path, course_id, case_study_id)

    r = client.post(
        f"/api/v1/courses/{course_id}/variants/{variant_id}/promote", headers=headers
    )

    assert r.status_code == 200, r.text
    assert r.json()["verification"] == "manual"
    assert r.json()["flag_reason"] is None
    # Promoting again: it is no longer flagged, so there is nothing to promote.
    assert (
        client.post(
            f"/api/v1/courses/{course_id}/variants/{variant_id}/promote",
            headers=headers,
        ).status_code
        == 409
    )


def test_editing_makes_the_variant_the_professors_own(
    client: TestClient, tmp_path: Path
) -> None:
    headers = professor(client)
    course_id, case_study_id = make_case_study(client, headers, tmp_path)
    variant_id = seed_variant(
        tmp_path, course_id, case_study_id, verification="verified", flag_reason=None
    )

    r = client.patch(
        f"/api/v1/courses/{course_id}/variants/{variant_id}",
        json={"solution": "Corrected working."},
        headers=headers,
    )

    assert r.status_code == 200, r.text
    assert r.json()["verification"] == "manual"
    detail = client.get(
        f"/api/v1/courses/{course_id}/variants/{variant_id}", headers=headers
    ).json()
    assert detail["solution"] == "Corrected working."
    assert detail["final_answers"] == ["2.553 mA"]  # answers survive the edit


def test_discard_deletes_unless_a_submission_references_it(
    client: TestClient, tmp_path: Path
) -> None:
    headers = professor(client)
    course_id, case_study_id = make_case_study(client, headers, tmp_path)
    discardable = seed_variant(tmp_path, course_id, case_study_id, seed=1)
    referenced = seed_variant(tmp_path, course_id, case_study_id, seed=2)
    conn = connect(tmp_path / "courses" / f"{course_id}.db")
    try:
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute(
            "INSERT INTO submissions (variant_id, seat_id, page_count,"
            " storage_prefix, status, submitted_at)"
            " VALUES (?, 1, 1, 'p', 'uploaded', 0)",
            (referenced,),
        )
    finally:
        conn.close()

    assert (
        client.delete(
            f"/api/v1/courses/{course_id}/variants/{discardable}", headers=headers
        ).status_code
        == 204
    )
    assert (
        client.delete(
            f"/api/v1/courses/{course_id}/variants/{referenced}", headers=headers
        ).status_code
        == 409
    )


def test_the_surface_is_professor_and_owner_only(
    client: TestClient, tmp_path: Path
) -> None:
    headers = professor(client)
    course_id, case_study_id = make_case_study(client, headers, tmp_path)
    variant_id = seed_variant(tmp_path, course_id, case_study_id)
    other = professor(client, email="other@example.edu")

    url = f"/api/v1/courses/{course_id}/case-studies/{case_study_id}/variants"
    assert client.post(url, json={}, headers=other).status_code == 403
    assert client.get(url, headers=other).status_code == 403
    assert client.post(url, json={}).status_code == 401
    assert (
        client.get(
            f"/api/v1/courses/{course_id}/variants/{variant_id}", headers=other
        ).status_code
        == 403
    )
    assert (
        client.get(
            f"/api/v1/courses/{course_id}/variants/999999", headers=headers
        ).status_code
        == 404
    )
