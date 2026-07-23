"""Milestone 1.5: the seat lifecycle end to end, the authorization
properties of backend 7.1, and the plaintext-exactly-once discipline."""

import logging
import re
from collections.abc import Iterator
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

import httpx
import pytest
from fastapi.testclient import TestClient

from app.db.connection import connect
from app.main import create_app
from app.seats.codes import ALPHABET, generate_code, normalize_code
from app.storage import get_object_storage

SECRET = "test-secret-not-for-production-0123"
PASSWORD = "a sensible passphrase"
CODE_RE = re.compile(r"^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$")


class FakeObjectStorage:
    """In-memory stand-in satisfying app.storage.ObjectStorage."""

    def __init__(self) -> None:
        self.objects: dict[tuple[str, str], bytes] = {}
        self.presigned: list[tuple[str, int]] = []

    def create_bucket(self, *, Bucket: str) -> object:
        return {}

    def put_object(self, *, Bucket: str, Key: str, Body: Any) -> object:
        data = Body.read() if hasattr(Body, "read") else bytes(Body)
        self.objects[(Bucket, Key)] = data
        return {}

    def generate_presigned_url(
        self, ClientMethod: str, Params: dict[str, str], ExpiresIn: int
    ) -> str:
        self.presigned.append((Params["Key"], ExpiresIn))
        return (
            f"https://storage.test/{Params['Bucket']}/{Params['Key']}"
            f"?X-Amz-Expires={ExpiresIn}"
        )


@pytest.fixture()
def storage() -> FakeObjectStorage:
    return FakeObjectStorage()


@pytest.fixture()
def client(tmp_path: Path, storage: FakeObjectStorage) -> Iterator[TestClient]:
    app = create_app(data_dir=tmp_path, jwt_secret=SECRET)
    app.dependency_overrides[get_object_storage] = lambda: storage
    with TestClient(app) as c:
        yield c


def professor(client: TestClient, email: str = "prof@example.edu") -> dict[str, str]:
    r = client.post(
        "/api/v1/auth/signup", json={"email": email, "password": PASSWORD}
    )
    assert r.status_code == 201
    return {"Authorization": f"Bearer {r.json()['token']}"}


def make_course(
    client: TestClient, headers: dict[str, str], title: str = "FDSC 315"
) -> int:
    r = client.post("/api/v1/courses", json={"title": title}, headers=headers)
    assert r.status_code == 201
    return int(r.json()["id"])


def generate_seats(
    client: TestClient, headers: dict[str, str], course_id: int, count: int = 8
) -> httpx.Response:
    response: httpx.Response = client.post(
        f"/api/v1/courses/{course_id}/seats",
        json={"count": count},
        headers=headers,
    )
    return response


def csv_codes(storage: FakeObjectStorage) -> dict[str, str]:
    """seat_number -> formatted code from the most recent CSV artifact."""
    csv_bytes = next(
        data for (_, key), data in storage.objects.items() if key.endswith(".csv")
    )
    lines = csv_bytes.decode().strip().splitlines()[1:]
    return dict(line.split(",") for line in lines)


def redeem(client: TestClient, code: str) -> httpx.Response:
    response: httpx.Response = client.post(
        "/api/v1/seats/redeem", json={"code": code}
    )
    return response


# ------------------------------------------------------------- generation


def test_generation_creates_numbered_hashed_seats(
    client: TestClient, storage: FakeObjectStorage, tmp_path: Path
) -> None:
    headers = professor(client)
    course_id = make_course(client, headers)
    r = generate_seats(client, headers, course_id, count=8)
    assert r.status_code == 201
    body = r.json()
    assert body["count"] == 8
    assert "csv_url" in body and "pdf_url" in body

    conn = connect(tmp_path / "directory.db", readonly=True)
    try:
        rows = conn.execute(
            "SELECT seat_number, code_hash, code_prefix, status FROM seats"
            " WHERE course_id = ? ORDER BY seat_number",
            (course_id,),
        ).fetchall()
    finally:
        conn.close()
    assert [row[0] for row in rows] == [f"S-{i:03d}" for i in range(1, 9)]
    for _, code_hash, code_prefix, status in rows:
        assert code_hash.startswith("$argon2id$")
        assert len(code_prefix) == 4
        assert all(ch in ALPHABET for ch in code_prefix)
        assert status == "active"


def test_generation_response_carries_no_codes(
    client: TestClient, storage: FakeObjectStorage
) -> None:
    headers = professor(client)
    course_id = make_course(client, headers)
    r = generate_seats(client, headers, course_id)
    codes = csv_codes(storage)
    for code in codes.values():
        assert CODE_RE.match(code)
        assert code not in r.text
        assert code.replace("-", "") not in r.text


def test_artifacts_and_short_lived_urls(
    client: TestClient, storage: FakeObjectStorage
) -> None:
    headers = professor(client)
    course_id = make_course(client, headers)
    r = generate_seats(client, headers, course_id)
    body = r.json()

    pdf_bytes = next(
        data for (_, key), data in storage.objects.items() if key.endswith(".pdf")
    )
    assert pdf_bytes.startswith(b"%PDF")
    assert len(csv_codes(storage)) == 8

    for url in (body["csv_url"], body["pdf_url"]):
        expires = int(parse_qs(urlparse(url).query)["X-Amz-Expires"][0])
        assert expires <= 900
    assert all(expiry <= 900 for _, expiry in storage.presigned)


def test_plaintext_codes_never_stored(
    client: TestClient, storage: FakeObjectStorage, tmp_path: Path
) -> None:
    headers = professor(client)
    course_id = make_course(client, headers)
    generate_seats(client, headers, course_id)
    codes = csv_codes(storage)
    raw = (tmp_path / "directory.db").read_bytes()
    for code in codes.values():
        assert code.encode() not in raw
        assert code.replace("-", "").encode() not in raw


# ------------------------------------------------------------- redemption


def test_redeem_roundtrip_and_seat_me(
    client: TestClient, storage: FakeObjectStorage
) -> None:
    headers = professor(client)
    course_id = make_course(client, headers, title="FDSC 315")
    generate_seats(client, headers, course_id)
    code = csv_codes(storage)["S-001"]

    r = redeem(client, code)
    assert r.status_code == 200
    body = r.json()
    assert body["seat_number"] == "S-001"
    assert body["course_id"] == course_id
    token = body["token"]

    me = client.get(
        "/api/v1/seats/me", headers={"Authorization": f"Bearer {token}"}
    )
    assert me.status_code == 200
    assert me.json()["seat_number"] == "S-001"
    assert me.json()["course_title"] == "FDSC 315"


def test_redeem_normalizes_formatting_and_ambiguity(
    client: TestClient, storage: FakeObjectStorage
) -> None:
    headers = professor(client)
    course_id = make_course(client, headers)
    generate_seats(client, headers, course_id)
    code = csv_codes(storage)["S-002"]
    mangled = code.replace("-", " ").lower().replace("1", "l").replace("0", "o")
    assert redeem(client, mangled).status_code == 200


def test_bad_and_revoked_codes_fail_identically(
    client: TestClient, storage: FakeObjectStorage
) -> None:
    headers = professor(client)
    course_id = make_course(client, headers)
    generate_seats(client, headers, course_id)
    code = csv_codes(storage)["S-003"]

    seat_id = _seat_id(client, headers, course_id, "S-003")
    assert (
        client.post(f"/api/v1/seats/{seat_id}/revoke", headers=headers).status_code
        == 200
    )

    revoked = redeem(client, code)
    wrong = redeem(client, generate_code())
    assert revoked.status_code == wrong.status_code == 401
    assert revoked.json() == wrong.json()
    assert revoked.headers["content-type"].startswith("application/problem+json")


def _seat_id(
    client: TestClient, headers: dict[str, str], course_id: int, seat_number: str
) -> int:
    r = client.get(f"/api/v1/courses/{course_id}/seats", headers=headers)
    assert r.status_code == 200
    return int(
        next(s["id"] for s in r.json()["seats"] if s["seat_number"] == seat_number)
    )


# ------------------------------------------------------- revoke and reissue


def test_revoke_kills_sessions_immediately(
    client: TestClient, storage: FakeObjectStorage
) -> None:
    headers = professor(client)
    course_id = make_course(client, headers)
    generate_seats(client, headers, course_id)
    code = csv_codes(storage)["S-001"]
    token = redeem(client, code).json()["token"]
    seat_id = _seat_id(client, headers, course_id, "S-001")

    client.post(f"/api/v1/seats/{seat_id}/revoke", headers=headers)
    me = client.get(
        "/api/v1/seats/me", headers={"Authorization": f"Bearer {token}"}
    )
    assert me.status_code == 401
    assert redeem(client, code).status_code == 401


def test_reissue_preserves_seat_and_kills_old_credential(
    client: TestClient, storage: FakeObjectStorage
) -> None:
    headers = professor(client)
    course_id = make_course(client, headers)
    generate_seats(client, headers, course_id)
    old_code = csv_codes(storage)["S-002"]
    old_token = redeem(client, old_code).json()["token"]
    seat_id = _seat_id(client, headers, course_id, "S-002")

    r = client.post(f"/api/v1/seats/{seat_id}/reissue", headers=headers)
    assert r.status_code == 200
    new_code = r.json()["code"]
    assert CODE_RE.match(new_code)
    assert normalize_code(new_code) != normalize_code(old_code)

    assert redeem(client, old_code).status_code == 401
    assert (
        client.get(
            "/api/v1/seats/me", headers={"Authorization": f"Bearer {old_token}"}
        ).status_code
        == 401
    )
    again = redeem(client, new_code)
    assert again.status_code == 200
    assert again.json()["seat_number"] == "S-002"
    assert _seat_id(client, headers, course_id, "S-002") == seat_id


# ------------------------------------------------------------ rate limiting


def test_redemption_rate_limit_with_backoff(
    client: TestClient, storage: FakeObjectStorage
) -> None:
    headers = professor(client)
    course_id = make_course(client, headers)
    generate_seats(client, headers, course_id)
    for _ in range(10):
        assert redeem(client, generate_code()).status_code == 401
    r1 = redeem(client, generate_code())
    assert r1.status_code == 429
    retry1 = int(r1.headers["retry-after"])
    r2 = redeem(client, generate_code())
    retry2 = int(r2.headers["retry-after"])
    assert r2.status_code == 429
    assert retry2 >= retry1
    assert r1.headers["content-type"].startswith("application/problem+json")


# ---------------------------------------------------- authorization properties


def test_only_the_owner_manages_seats(
    client: TestClient, storage: FakeObjectStorage
) -> None:
    owner = professor(client, "owner@example.edu")
    intruder = professor(client, "intruder@example.edu")
    course_id = make_course(client, owner)
    generate_seats(client, owner, course_id)
    seat_id = _seat_id(client, owner, course_id, "S-001")

    assert generate_seats(client, intruder, course_id).status_code == 403
    assert (
        client.get(f"/api/v1/courses/{course_id}/seats", headers=intruder).status_code
        == 403
    )
    assert (
        client.post(f"/api/v1/seats/{seat_id}/revoke", headers=intruder).status_code
        == 403
    )
    assert (
        client.post(f"/api/v1/seats/{seat_id}/reissue", headers=intruder).status_code
        == 403
    )


def test_seat_tokens_rejected_on_professor_surfaces(
    client: TestClient, storage: FakeObjectStorage
) -> None:
    headers = professor(client)
    course_id = make_course(client, headers)
    generate_seats(client, headers, course_id)
    token = redeem(client, csv_codes(storage)["S-001"]).json()["token"]
    seat_headers = {"Authorization": f"Bearer {token}"}

    assert (
        client.post(
            f"/api/v1/courses/{course_id}/seats", json={"count": 1}, headers=seat_headers
        ).status_code
        == 403
    )
    assert (
        client.get(
            f"/api/v1/courses/{course_id}/seats", headers=seat_headers
        ).status_code
        == 403
    )
    assert (
        client.post("/api/v1/courses", json={"title": "X"}, headers=seat_headers)
    ).status_code == 403


def test_professor_jwt_rejected_on_seat_surface(
    client: TestClient, storage: FakeObjectStorage
) -> None:
    headers = professor(client)
    assert client.get("/api/v1/seats/me", headers=headers).status_code == 403


def test_each_seat_sees_only_itself(
    client: TestClient, storage: FakeObjectStorage
) -> None:
    headers = professor(client)
    course_id = make_course(client, headers)
    generate_seats(client, headers, course_id)
    codes = csv_codes(storage)
    for seat_number in ("S-001", "S-004", "S-008"):
        token = redeem(client, codes[seat_number]).json()["token"]
        me = client.get(
            "/api/v1/seats/me", headers={"Authorization": f"Bearer {token}"}
        )
        assert me.json()["seat_number"] == seat_number
        assert me.json()["course_id"] == course_id


# --------------------------------------------------- plaintext exactly once


def test_plaintext_codes_exactly_once_and_never_logged(
    client: TestClient,
    storage: FakeObjectStorage,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """The gate's log-scanning test: run the whole lifecycle capturing all
    logs and all response bodies; every plaintext code appears in exactly
    one response ever (the CSV for generated codes, the reissue body for
    reissued ones) and in no log record."""
    caplog.set_level(logging.DEBUG)
    responses: list[str] = []

    headers = professor(client)
    course_id = make_course(client, headers)
    r = generate_seats(client, headers, course_id)
    responses.append(r.text)
    codes = csv_codes(storage)

    responses.append(redeem(client, codes["S-001"]).text)
    seat_id = _seat_id(client, headers, course_id, "S-002")
    reissue = client.post(f"/api/v1/seats/{seat_id}/reissue", headers=headers)
    responses.append(reissue.text)
    new_code = reissue.json()["code"]

    listing = client.get(f"/api/v1/courses/{course_id}/seats", headers=headers)
    responses.append(listing.text)

    all_codes = [*codes.values(), new_code]
    log_text = caplog.text
    csv_text = next(
        data for (_, key), data in storage.objects.items() if key.endswith(".csv")
    ).decode()

    for code in all_codes:
        assert code not in log_text
        assert code.replace("-", "") not in log_text
        in_responses = sum(code in text for text in responses)
        in_csv = 1 if code in csv_text else 0
        assert in_responses + in_csv == 1, f"{code}: seen {in_responses + in_csv} times"
