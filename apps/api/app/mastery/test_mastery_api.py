"""The mastery surface: the seat's picture is seat-only with trails, the
revisit queue targets one variant per concept exactly as spec section 5
prescribes, the professor's distribution counts labels without ranking seats,
and grading supersedes automatic evidence in one transaction."""

import io
import time
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.compression import compress_text
from app.db.connection import connect
from app.main import create_app
from app.storage import get_object_storage
from mastery_store import MasteryStore

SECRET = "test-secret-not-for-production-0123"
PASSWORD = "a sensible passphrase"
DAY = 86_400


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


def seat(
    client: TestClient, headers: dict[str, str], course_id: int, storage: FakeStorage
) -> dict[str, str]:
    before = set(storage.objects)
    r = client.post(
        f"/api/v1/courses/{course_id}/seats", json={"count": 1}, headers=headers
    )
    assert r.status_code == 201, r.text
    csv_key = next(
        key for key in set(storage.objects) - before if key[1].endswith(".csv")
    )
    code = storage.objects[csv_key].decode().strip().splitlines()[1].split(",")[1]
    redeemed = client.post("/api/v1/seats/redeem", json={"code": code})
    assert redeemed.status_code == 200, redeemed.text
    return {"Authorization": f"Bearer {redeemed.json()['token']}"}


def make_course(
    client: TestClient, headers: dict[str, str]
) -> tuple[int, int]:
    r = client.post("/api/v1/courses", json={"title": "EE 201"}, headers=headers)
    course_id = int(r.json()["id"])
    concept = client.post(
        f"/api/v1/courses/{course_id}/concepts",
        json={"name": "Ohm's law", "description": "V = IR"},
        headers=headers,
    )
    return course_id, int(concept.json()["id"])


def seed_history(
    tmp_path: Path,
    course_id: int,
    concept_id: int,
    *,
    seat_id: int = 1,
    days: int = 3,
    last_at: int | None = None,
    score: float = 1.0,
) -> None:
    """Direct store history: `days` daily events ending at `last_at`."""
    end = int(last_at if last_at is not None else time.time())
    conn = connect(tmp_path / "courses" / f"{course_id}.db")
    try:
        store = MasteryStore(conn)
        for day in range(days):
            store.record_event(
                seat_id=seat_id, concept_id=concept_id, source="answer_match",
                score=score, confidence=0.95, k=1.0,
                ref_kind="submission", ref_id=day,
                at=end - (days - 1 - day) * DAY,
            )
        conn.commit()
    finally:
        conn.close()


def test_the_seat_picture_carries_labels_and_trails(
    client: TestClient, tmp_path: Path, storage: FakeStorage
) -> None:
    headers = professor(client)
    course_id, concept_id = make_course(client, headers)
    other_concept = client.post(
        f"/api/v1/courses/{course_id}/concepts",
        json={"name": "Power"},
        headers=headers,
    ).json()["id"]
    seat_headers = seat(client, headers, course_id, storage)
    seed_history(tmp_path, course_id, concept_id)

    r = client.get(f"/api/v1/courses/{course_id}/mastery", headers=seat_headers)

    assert r.status_code == 200, r.text
    by_id = {c["concept_id"]: c for c in r.json()["concepts"]}
    practised = by_id[concept_id]
    assert practised["label"] in ("developing", "solid")
    assert len(practised["trail"]) >= 1  # never a bare label
    untouched = by_id[other_concept]
    assert untouched["label"] == "unseen"
    assert untouched["trail"] == []


def test_the_seat_picture_is_seat_only(
    client: TestClient, tmp_path: Path, storage: FakeStorage
) -> None:
    headers = professor(client)
    course_id, _concept_id = make_course(client, headers)
    assert (
        client.get(f"/api/v1/courses/{course_id}/mastery", headers=headers).status_code
        == 403
    )
    assert client.get(f"/api/v1/courses/{course_id}/mastery").status_code == 401


def seed_case_with_pool(
    tmp_path: Path,
    course_id: int,
    concept_id: int,
    *,
    title: str,
    weight: float,
    variants: int = 1,
) -> tuple[int, list[int]]:
    conn = connect(tmp_path / "courses" / f"{course_id}.db")
    try:
        case = conn.execute(
            "INSERT INTO case_studies (author_id, title, body_z, status,"
            " created_at, updated_at) VALUES (1, ?, ?, 'published', 0, 0)",
            (title, compress_text(conn, "problem_text", "body")),
        )
        case_id = int(case.lastrowid or 0)
        conn.execute(
            "INSERT INTO case_study_concepts (case_study_id, concept_id, weight)"
            " VALUES (?, ?, ?)",
            (case_id, concept_id, weight),
        )
        variant_ids = []
        for index in range(variants):
            cursor = conn.execute(
                "INSERT INTO variants (case_study_id, seed, seed_json_z, body_z,"
                " solution_z, verification, model_id, created_at)"
                " VALUES (?, ?, ?, ?, ?, 'verified', 'm', 0)",
                (
                    case_id,
                    index,
                    compress_text(conn, "problem_text", "{}"),
                    compress_text(conn, "problem_text", "v"),
                    compress_text(conn, "problem_text", "s"),
                ),
            )
            variant_ids.append(int(cursor.lastrowid or 0))
        conn.commit()
        return case_id, variant_ids
    finally:
        conn.close()


def add_submission(
    tmp_path: Path, course_id: int, variant_id: int, *, seat_id: int, at: int
) -> int:
    conn = connect(tmp_path / "courses" / f"{course_id}.db")
    try:
        cursor = conn.execute(
            "INSERT INTO submissions (variant_id, seat_id, page_count,"
            " storage_prefix, status, submitted_at)"
            " VALUES (?, ?, 1, 'p', 'processed', ?)",
            (variant_id, seat_id, at),
        )
        conn.commit()
        return int(cursor.lastrowid or 0)
    finally:
        conn.close()


def test_the_revisit_queue_targets_spec_five_exactly(
    client: TestClient, tmp_path: Path, storage: FakeStorage
) -> None:
    """A faded concept is due; the target skips the higher-weight case
    attempted yesterday and draws an unattempted variant from the next."""
    headers = professor(client)
    course_id, concept_id = make_course(client, headers)
    seat_headers = seat(client, headers, course_id, storage)
    now = int(time.time())
    # Strong history that ended three weeks ago: retention has sagged below
    # the revisit trigger while m stays worth retaining.
    seed_history(
        tmp_path, course_id, concept_id, days=5, last_at=now - 21 * DAY
    )
    _heavy_case, heavy_variants = seed_case_with_pool(
        tmp_path, course_id, concept_id, title="Core case", weight=1.0
    )
    light_case, light_variants = seed_case_with_pool(
        tmp_path, course_id, concept_id, title="Side case", weight=0.5, variants=2
    )
    # The heavy case was attempted an hour ago, so it is excluded (48 h rule);
    # one of the light case's variants was attempted long ago, so the other
    # is the draw.
    add_submission(
        tmp_path, course_id, heavy_variants[0], seat_id=1, at=now - 3600
    )
    add_submission(
        tmp_path, course_id, light_variants[0], seat_id=1, at=now - 30 * DAY
    )

    r = client.get(f"/api/v1/courses/{course_id}/revisit", headers=seat_headers)

    assert r.status_code == 200, r.text
    concepts = r.json()["concepts"]
    assert [c["concept_id"] for c in concepts] == [concept_id]
    target = concepts[0]["variant"]
    assert target is not None
    assert target["case_study_id"] == light_case
    assert target["variant_id"] == light_variants[1]
    assert target["case_study_title"] == "Side case"


def test_a_fresh_concept_is_not_due(
    client: TestClient, tmp_path: Path, storage: FakeStorage
) -> None:
    headers = professor(client)
    course_id, concept_id = make_course(client, headers)
    seat_headers = seat(client, headers, course_id, storage)
    seed_history(tmp_path, course_id, concept_id)  # practised just now

    r = client.get(f"/api/v1/courses/{course_id}/revisit", headers=seat_headers)
    assert r.json() == {"concepts": []}


def test_the_distribution_counts_labels_without_ranking(
    client: TestClient, tmp_path: Path, storage: FakeStorage
) -> None:
    headers = professor(client)
    course_id, concept_id = make_course(client, headers)
    seat(client, headers, course_id, storage)
    seat(client, headers, course_id, storage)
    seat(client, headers, course_id, storage)
    # Seat 1 has a solid-grade history, seat 2 a failing one, seat 3 nothing.
    seed_history(tmp_path, course_id, concept_id, seat_id=1, days=7)
    seed_history(tmp_path, course_id, concept_id, seat_id=2, days=2, score=0.0)

    r = client.get(
        f"/api/v1/courses/{course_id}/mastery/distribution", headers=headers
    )

    assert r.status_code == 200, r.text
    concept = r.json()["concepts"][0]
    assert concept["concept_id"] == concept_id
    assert concept["unseen"] == 1
    assert concept["shaky"] == 1
    assert concept["solid"] == 1
    assert concept["gaps"] == []  # named gaps arrive with the Phase 7 defense
    # No per-seat ranking exists anywhere in the shape.
    assert "seats" not in concept and "seat_ids" not in concept


def test_the_distribution_is_owner_only(
    client: TestClient, tmp_path: Path, storage: FakeStorage
) -> None:
    headers = professor(client)
    course_id, _concept_id = make_course(client, headers)
    seat_headers = seat(client, headers, course_id, storage)
    other = professor(client, email="other@example.edu")
    url = f"/api/v1/courses/{course_id}/mastery/distribution"
    assert client.get(url, headers=seat_headers).status_code == 403
    assert client.get(url, headers=other).status_code == 403
    assert client.get(url).status_code == 401


def test_grading_supersedes_the_automatic_evidence(
    client: TestClient, tmp_path: Path, storage: FakeStorage
) -> None:
    """A misread submission produced a failing automatic event; the
    professor's grade retracts it from the estimate (spec 4.6) and the
    student's picture recovers."""
    headers = professor(client)
    course_id, concept_id = make_course(client, headers)
    seat_headers = seat(client, headers, course_id, storage)
    _case, variants = seed_case_with_pool(
        tmp_path, course_id, concept_id, title="Core", weight=1.0
    )
    now = int(time.time())
    submission_id = add_submission(
        tmp_path, course_id, variants[0], seat_id=1, at=now
    )
    # The bad automatic event, tied to the same submission.
    conn = connect(tmp_path / "courses" / f"{course_id}.db")
    try:
        MasteryStore(conn).record_event(
            seat_id=1, concept_id=concept_id, source="answer_match",
            score=0.0, confidence=0.9, k=1.0,
            ref_kind="submission", ref_id=submission_id, at=now,
        )
        conn.commit()
    finally:
        conn.close()
    before = client.get(
        f"/api/v1/courses/{course_id}/mastery", headers=seat_headers
    ).json()["concepts"][0]

    r = client.post(
        f"/api/v1/courses/{course_id}/submissions/{submission_id}/grade",
        json={"score": 1.0},
        headers=headers,
    )

    assert r.status_code == 200, r.text
    assert r.json()["score"] == 1.0
    after = client.get(
        f"/api/v1/courses/{course_id}/mastery", headers=seat_headers
    ).json()["concepts"][0]
    assert after["m_eff"] > before["m_eff"]  # the misread no longer drags
    conn = connect(tmp_path / "courses" / f"{course_id}.db")
    try:
        graded = conn.execute(
            "SELECT grade, graded_at FROM submissions WHERE id = ?",
            (submission_id,),
        ).fetchone()
        sources = [
            str(r[0])
            for r in conn.execute(
                "SELECT source FROM evidence_events ORDER BY id"
            ).fetchall()
        ]
    finally:
        conn.close()
    assert float(graded[0]) == 1.0 and graded[1] is not None
    # The log keeps everything: supersession is replay, never deletion.
    assert sources == ["answer_match", "professor_grade"]


def test_grading_is_owner_only_and_404s_unknown(
    client: TestClient, tmp_path: Path, storage: FakeStorage
) -> None:
    headers = professor(client)
    course_id, concept_id = make_course(client, headers)
    seat_headers = seat(client, headers, course_id, storage)
    _case, variants = seed_case_with_pool(
        tmp_path, course_id, concept_id, title="Core", weight=1.0
    )
    submission_id = add_submission(
        tmp_path, course_id, variants[0], seat_id=1, at=0
    )
    other = professor(client, email="other@example.edu")
    url = f"/api/v1/courses/{course_id}/submissions/{submission_id}/grade"
    assert client.post(url, json={"score": 1.0}, headers=other).status_code == 403
    assert client.post(url, json={"score": 1.0}, headers=seat_headers).status_code == 403
    assert client.post(url, json={"score": 1.0}).status_code == 401
    assert (
        client.post(
            f"/api/v1/courses/{course_id}/submissions/999999/grade",
            json={"score": 1.0},
            headers=headers,
        ).status_code
        == 404
    )
