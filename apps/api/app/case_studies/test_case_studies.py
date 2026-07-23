"""Milestone 2.1: course, concept, and case study authoring end to end.

Covers the CRUD surfaces, markdown bodies compressed at rest through the
codec, publish states, case-to-concept mappings (mastery spec section 2),
and the authorization properties: only the owner authors, a seat reads only
its own course's published content, and shards stay isolated."""

from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.compression import decompress_text
from app.db.connection import connect
from app.main import create_app
from app.storage import get_object_storage

SECRET = "test-secret-not-for-production-0123"
PASSWORD = "a sensible passphrase"
ZSTD_MAGIC = b"\x28\xb5\x2f\xfd"

BODY = (
    "# Net present value\n\n"
    "A firm evaluates an expansion with cashflows over five years. "
    "Discount them at the stated rate and decide whether $NPV > 0$.\n\n"
    "![circuit](fig://1)\n"
)


class FakeObjectStorage:
    """In-memory stand-in satisfying app.storage.ObjectStorage (seat codes)."""

    def __init__(self) -> None:
        self.objects: dict[tuple[str, str], bytes] = {}

    def create_bucket(self, *, Bucket: str) -> object:
        return {}

    def put_object(self, *, Bucket: str, Key: str, Body: Any) -> object:
        data = Body.read() if hasattr(Body, "read") else bytes(Body)
        self.objects[(Bucket, Key)] = data
        return {}

    def generate_presigned_url(
        self, ClientMethod: str, Params: dict[str, str], ExpiresIn: int
    ) -> str:
        return f"https://storage.test/{Params['Bucket']}/{Params['Key']}"


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


def make_course(client: TestClient, headers: dict[str, str], title: str = "FDSC 315") -> int:
    r = client.post("/api/v1/courses", json={"title": title}, headers=headers)
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


def make_case_study(
    client: TestClient,
    headers: dict[str, str],
    course_id: int,
    title: str = "NPV of an expansion",
    body: str = BODY,
) -> dict[str, Any]:
    r = client.post(
        f"/api/v1/courses/{course_id}/case-studies",
        json={"title": title, "body": body},
        headers=headers,
    )
    assert r.status_code == 201, r.text
    return dict(r.json())


def make_concept(
    client: TestClient,
    headers: dict[str, str],
    course_id: int,
    name: str = "Discounted cash flow",
    description: str | None = "Translating future cashflows into present value",
) -> int:
    r = client.post(
        f"/api/v1/courses/{course_id}/concepts",
        json={"name": name, "description": description},
        headers=headers,
    )
    assert r.status_code == 201, r.text
    return int(r.json()["id"])


# -------------------------------------------------------------- course CRUD


def test_course_crud_roundtrip(client: TestClient) -> None:
    headers = professor(client)
    course_id = make_course(client, headers, "FDSC 315")

    listed = client.get("/api/v1/courses", headers=headers)
    assert listed.status_code == 200
    assert [c["id"] for c in listed.json()["courses"]] == [course_id]

    got = client.get(f"/api/v1/courses/{course_id}", headers=headers)
    assert got.status_code == 200
    assert got.json()["title"] == "FDSC 315"

    patched = client.patch(
        f"/api/v1/courses/{course_id}", json={"title": "FDSC 315: Data science"}, headers=headers
    )
    assert patched.status_code == 200
    assert patched.json()["title"] == "FDSC 315: Data science"

    deleted = client.delete(f"/api/v1/courses/{course_id}", headers=headers)
    assert deleted.status_code == 204
    assert client.get(f"/api/v1/courses/{course_id}", headers=headers).status_code == 404


def test_only_owner_reads_and_mutates_a_course(client: TestClient) -> None:
    owner = professor(client, "owner@example.edu")
    intruder = professor(client, "intruder@example.edu")
    course_id = make_course(client, owner)

    assert client.get(f"/api/v1/courses/{course_id}", headers=intruder).status_code == 403
    assert (
        client.patch(
            f"/api/v1/courses/{course_id}", json={"title": "hijacked"}, headers=intruder
        ).status_code
        == 403
    )
    assert client.delete(f"/api/v1/courses/{course_id}", headers=intruder).status_code == 403
    # The intruder's own course list never shows another professor's course.
    assert client.get("/api/v1/courses", headers=intruder).json()["courses"] == []


def test_course_with_seats_is_not_deleted(
    client: TestClient, storage: FakeObjectStorage
) -> None:
    headers = professor(client)
    course_id = make_course(client, headers)
    seat_token(client, headers, course_id, storage)
    r = client.delete(f"/api/v1/courses/{course_id}", headers=headers)
    assert r.status_code == 409
    assert client.get(f"/api/v1/courses/{course_id}", headers=headers).status_code == 200


# ---------------------------------------------------------- case study CRUD


def test_case_study_create_and_get_roundtrips_body(client: TestClient) -> None:
    headers = professor(client)
    course_id = make_course(client, headers)
    created = make_case_study(client, headers, course_id)
    assert created["status"] == "draft"
    assert created["concepts"] == []

    got = client.get(
        f"/api/v1/courses/{course_id}/case-studies/{created['id']}", headers=headers
    )
    assert got.status_code == 200
    assert got.json()["body"] == BODY
    assert got.json()["title"] == "NPV of an expansion"


def test_case_study_body_is_compressed_at_rest(
    client: TestClient, tmp_data: Path
) -> None:
    headers = professor(client)
    course_id = make_course(client, headers)
    created = make_case_study(client, headers, course_id)

    conn = connect(tmp_data / "courses" / f"{course_id}.db", readonly=True)
    try:
        blob = conn.execute(
            "SELECT body_z FROM case_studies WHERE id = ?", (created["id"],)
        ).fetchone()[0]
        assert isinstance(blob, bytes)
        assert blob[:4] == ZSTD_MAGIC  # went through the codec, not stored raw
        assert decompress_text(conn, "problem_text", blob) == BODY
    finally:
        conn.close()


def test_case_study_list_is_cursor_paginated(client: TestClient) -> None:
    headers = professor(client)
    course_id = make_course(client, headers)
    ids = [make_case_study(client, headers, course_id, title=f"Case {i}")["id"] for i in range(5)]

    seen: list[int] = []
    cursor: int | None = None
    while True:
        url = f"/api/v1/courses/{course_id}/case-studies?limit=2"
        if cursor is not None:
            url += f"&cursor={cursor}"
        page = client.get(url, headers=headers)
        assert page.status_code == 200
        body = page.json()
        seen.extend(item["id"] for item in body["items"])
        cursor = body["next_cursor"]
        if cursor is None:
            break
    assert seen == ids
    # Summaries omit the (potentially large) body.
    first = client.get(f"/api/v1/courses/{course_id}/case-studies?limit=1", headers=headers)
    assert "body" not in first.json()["items"][0]


def test_case_study_update_and_delete(client: TestClient) -> None:
    headers = professor(client)
    course_id = make_course(client, headers)
    created = make_case_study(client, headers, course_id)
    cs_id = created["id"]

    patched = client.patch(
        f"/api/v1/courses/{course_id}/case-studies/{cs_id}",
        json={"title": "Revised", "body": "# Revised body\n"},
        headers=headers,
    )
    assert patched.status_code == 200
    assert patched.json()["title"] == "Revised"
    assert patched.json()["body"] == "# Revised body\n"
    assert patched.json()["updated_at"] >= created["updated_at"]

    assert (
        client.delete(
            f"/api/v1/courses/{course_id}/case-studies/{cs_id}", headers=headers
        ).status_code
        == 204
    )
    assert (
        client.get(
            f"/api/v1/courses/{course_id}/case-studies/{cs_id}", headers=headers
        ).status_code
        == 404
    )


# -------------------------------------------------------------- publish state


def test_publish_and_unpublish_transitions(client: TestClient) -> None:
    headers = professor(client)
    course_id = make_course(client, headers)
    cs_id = make_case_study(client, headers, course_id)["id"]

    published = client.post(
        f"/api/v1/courses/{course_id}/case-studies/{cs_id}/publish", headers=headers
    )
    assert published.status_code == 200
    assert published.json()["status"] == "published"

    unpublished = client.post(
        f"/api/v1/courses/{course_id}/case-studies/{cs_id}/unpublish", headers=headers
    )
    assert unpublished.status_code == 200
    assert unpublished.json()["status"] == "draft"


def test_student_reads_only_published_case_studies(
    client: TestClient, storage: FakeObjectStorage
) -> None:
    headers = professor(client)
    course_id = make_course(client, headers)
    draft = make_case_study(client, headers, course_id, title="Draft")
    published = make_case_study(client, headers, course_id, title="Published")
    client.post(
        f"/api/v1/courses/{course_id}/case-studies/{published['id']}/publish",
        headers=headers,
    )
    token = seat_token(client, headers, course_id, storage)
    seat = {"Authorization": f"Bearer {token}"}

    listed = client.get(f"/api/v1/courses/{course_id}/case-studies", headers=seat)
    assert listed.status_code == 200
    assert [item["id"] for item in listed.json()["items"]] == [published["id"]]

    assert (
        client.get(
            f"/api/v1/courses/{course_id}/case-studies/{published['id']}", headers=seat
        ).json()["body"]
        == BODY
    )
    # A draft simply does not exist for a student.
    assert (
        client.get(
            f"/api/v1/courses/{course_id}/case-studies/{draft['id']}", headers=seat
        ).status_code
        == 404
    )


# ----------------------------------------------------------------- concepts


def test_concept_crud(client: TestClient) -> None:
    headers = professor(client)
    course_id = make_course(client, headers)
    first = make_concept(client, headers, course_id, "Discounted cash flow")
    second = make_concept(client, headers, course_id, "Sensitivity analysis")

    listed = client.get(f"/api/v1/courses/{course_id}/concepts", headers=headers)
    assert listed.status_code == 200
    concepts = listed.json()["concepts"]
    assert [c["id"] for c in concepts] == [first, second]  # ordered by position
    assert concepts[0]["position"] < concepts[1]["position"]

    patched = client.patch(
        f"/api/v1/courses/{course_id}/concepts/{first}",
        json={"name": "DCF", "description": "Present value of future cashflows"},
        headers=headers,
    )
    assert patched.status_code == 200
    assert patched.json()["name"] == "DCF"

    assert (
        client.delete(
            f"/api/v1/courses/{course_id}/concepts/{second}", headers=headers
        ).status_code
        == 204
    )
    remaining = client.get(f"/api/v1/courses/{course_id}/concepts", headers=headers)
    assert [c["id"] for c in remaining.json()["concepts"]] == [first]


# ----------------------------------------------------- case-to-concept mappings


def test_mappings_set_and_surface_as_concept_tags(client: TestClient) -> None:
    headers = professor(client)
    course_id = make_course(client, headers)
    cs_id = make_case_study(client, headers, course_id)["id"]
    core = make_concept(client, headers, course_id, "Discounted cash flow")
    secondary = make_concept(client, headers, course_id, "Sensitivity analysis")

    r = client.put(
        f"/api/v1/courses/{course_id}/case-studies/{cs_id}/concepts",
        json={
            "mappings": [
                {"concept_id": core, "weight": 1.0},
                {"concept_id": secondary, "weight": 0.3},
            ]
        },
        headers=headers,
    )
    assert r.status_code == 200
    tags = {t["concept_id"]: t for t in r.json()["concepts"]}
    assert tags[core]["weight"] == 1.0
    assert tags[secondary]["weight"] == 0.3
    assert tags[core]["name"] == "Discounted cash flow"

    # A PUT replaces the whole set.
    replaced = client.put(
        f"/api/v1/courses/{course_id}/case-studies/{cs_id}/concepts",
        json={"mappings": [{"concept_id": core, "weight": 0.5}]},
        headers=headers,
    )
    assert [t["concept_id"] for t in replaced.json()["concepts"]] == [core]
    assert replaced.json()["concepts"][0]["weight"] == 0.5


def test_mapping_weight_out_of_range_is_rejected(client: TestClient) -> None:
    headers = professor(client)
    course_id = make_course(client, headers)
    cs_id = make_case_study(client, headers, course_id)["id"]
    concept = make_concept(client, headers, course_id)

    for bad in (0.0, 1.5, -0.2):
        r = client.put(
            f"/api/v1/courses/{course_id}/case-studies/{cs_id}/concepts",
            json={"mappings": [{"concept_id": concept, "weight": bad}]},
            headers=headers,
        )
        assert r.status_code == 422, f"weight {bad} should be rejected"


def test_mapping_to_unknown_concept_is_rejected(client: TestClient) -> None:
    headers = professor(client)
    course_id = make_course(client, headers)
    cs_id = make_case_study(client, headers, course_id)["id"]
    r = client.put(
        f"/api/v1/courses/{course_id}/case-studies/{cs_id}/concepts",
        json={"mappings": [{"concept_id": 9999, "weight": 1.0}]},
        headers=headers,
    )
    assert r.status_code == 400


# ---------------------------------------------------- authorization properties


def test_seat_cannot_author(client: TestClient, storage: FakeObjectStorage) -> None:
    headers = professor(client)
    course_id = make_course(client, headers)
    cs_id = make_case_study(client, headers, course_id)["id"]
    token = seat_token(client, headers, course_id, storage)
    seat = {"Authorization": f"Bearer {token}"}

    assert (
        client.post(
            f"/api/v1/courses/{course_id}/case-studies",
            json={"title": "x", "body": "y"},
            headers=seat,
        ).status_code
        == 403
    )
    assert (
        client.patch(
            f"/api/v1/courses/{course_id}/case-studies/{cs_id}",
            json={"title": "x"},
            headers=seat,
        ).status_code
        == 403
    )
    assert (
        client.post(
            f"/api/v1/courses/{course_id}/case-studies/{cs_id}/publish", headers=seat
        ).status_code
        == 403
    )
    assert (
        client.post(
            f"/api/v1/courses/{course_id}/concepts", json={"name": "x"}, headers=seat
        ).status_code
        == 403
    )


def test_non_owner_professor_cannot_author(client: TestClient) -> None:
    owner = professor(client, "owner@example.edu")
    intruder = professor(client, "intruder@example.edu")
    course_id = make_course(client, owner)
    cs_id = make_case_study(client, owner, course_id)["id"]

    assert (
        client.post(
            f"/api/v1/courses/{course_id}/case-studies",
            json={"title": "x", "body": "y"},
            headers=intruder,
        ).status_code
        == 403
    )
    assert (
        client.get(
            f"/api/v1/courses/{course_id}/case-studies/{cs_id}", headers=intruder
        ).status_code
        == 403
    )


def test_case_studies_are_isolated_between_courses(
    client: TestClient, storage: FakeObjectStorage
) -> None:
    headers = professor(client)
    course_a = make_course(client, headers, "Course A")
    course_b = make_course(client, headers, "Course B")
    cs_in_a = make_case_study(client, headers, course_a)["id"]

    # The case study is not reachable through course B's shard.
    assert (
        client.get(
            f"/api/v1/courses/{course_b}/case-studies/{cs_in_a}", headers=headers
        ).status_code
        == 404
    )
    assert client.get(f"/api/v1/courses/{course_b}/case-studies", headers=headers).json()[
        "items"
    ] == []

    # A seat scoped to course A cannot read course B at all.
    token = seat_token(client, headers, course_a, storage)
    seat = {"Authorization": f"Bearer {token}"}
    assert (
        client.get(f"/api/v1/courses/{course_b}/case-studies", headers=seat).status_code
        == 403
    )
