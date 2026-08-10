"""Rate limiting under distributed attempts (milestone 9.2).

The redemption limiter is 10 attempts per IP per hour with exponential backoff
(backend guide 7.1). This verifies it does what it claims, and states plainly
what it does not: per-IP limiting cannot stop an attacker who rotates
addresses, and it is not the control that makes seat codes safe. That control
is entropy, asserted here as a number rather than assumed, and the limiter is
defence in depth on top of it.

The per-IP choice buys something a global limiter would not, and that is worth
protecting with a test of its own: an attacker hammering redemption cannot lock
the class out. A global counter would turn a cheap attack into a denial of
service against exactly the students the platform exists for.
"""

import math
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.main import create_app
from app.seats.codes import ALPHABET, CODE_LENGTH
from app.seats.ratelimit import RateLimiter
from app.storage import get_object_storage
from app.submissions.test_submissions import (
    FakeObjectStorage,
    make_course,
    professor,
)

SECRET = "security-suite-secret-0123456789abcdef"
WRONG_CODE = "MK4T-9RWF-C2HP-X6ZD"


@pytest.fixture()
def storage() -> FakeObjectStorage:
    return FakeObjectStorage()


@pytest.fixture()
def app(tmp_path: Path, storage: FakeObjectStorage) -> FastAPI:
    built = create_app(data_dir=tmp_path, jwt_secret=SECRET)
    built.dependency_overrides[get_object_storage] = lambda: storage
    return built


@pytest.fixture()
def client(app: FastAPI) -> Iterator[TestClient]:
    with TestClient(app) as c:
        yield c


def attempt(app: FastAPI, code: str, ip: str) -> int:
    """One redemption attempt from a given address.

    The address has to be set on the ASGI scope, not sent as a header: the
    limiter reads `request.client.host`, which is what a proxy-less deployment
    sees, and a header would have proved nothing. This client is used without
    its context manager on purpose, so it issues requests against an app whose
    lifespan the fixture already started rather than opening a second one."""
    response = TestClient(app, client=(ip, 40000)).post(
        "/api/v1/seats/redeem", json={"code": code}
    )
    return int(response.status_code)


# ------------------------------------------------------------- the stated control


def test_the_eleventh_attempt_from_one_address_is_refused() -> None:
    """The limiter itself, exercised directly on a virtual clock so the test
    does not wait an hour to prove a window."""
    limiter = RateLimiter()

    allowed = [limiter.check("203.0.113.5", now=float(i)) for i in range(10)]
    refused = limiter.check("203.0.113.5", now=10.0)

    assert allowed == [None] * 10
    assert refused is not None and refused > 0


def test_backoff_doubles_and_is_capped() -> None:
    limiter = RateLimiter()
    for i in range(10):
        limiter.check("203.0.113.6", now=float(i))

    waits = [limiter.check("203.0.113.6", now=10.0 + i) for i in range(6)]

    assert waits[0] == limiter.backoff_base_seconds
    assert waits[1] == limiter.backoff_base_seconds * 2
    assert waits[2] == limiter.backoff_base_seconds * 4
    assert all(w is not None and w <= limiter.backoff_cap_seconds for w in waits)


def test_the_window_rolls_off() -> None:
    """An hour later the address is clean again: the limiter throttles, it does
    not ban."""
    limiter = RateLimiter()
    for i in range(10):
        limiter.check("203.0.113.7", now=float(i))
    assert limiter.check("203.0.113.7", now=11.0) is not None

    assert limiter.check("203.0.113.7", now=limiter.window_seconds + 100.0) is None


# ------------------------------------------------------- what it does not stop


def test_a_distributed_attempt_is_not_stopped_by_per_ip_limiting() -> None:
    """Stated rather than glossed: two hundred addresses making nine attempts
    each, eighteen hundred guesses, and the limiter refuses none of them. This
    is not a defect in the limiter, it is the limit of what per-IP throttling
    can do, and it is why the next test asserts the control that actually
    carries the weight."""
    limiter = RateLimiter()

    refusals = [
        limiter.check(f"198.51.100.{host}", now=float(i))
        for host in range(200)
        for i in range(9)
    ]

    assert refusals.count(None) == len(refusals), "per-IP limiting stopped a spread attack"


def test_the_code_space_is_what_actually_makes_guessing_hopeless() -> None:
    """The real control, asserted as a number. Crockford base32 over sixteen
    characters is eighty bits, so an attacker managing a billion guesses a
    second, from as many addresses as they like, needs on the order of tens of
    millions of years to exhaust the space and roughly a million years to reach
    even a one-in-thirty chance. That is the control; the limiter is defence in
    depth on top of it."""
    bits = CODE_LENGTH * math.log2(len(ALPHABET))

    assert len(ALPHABET) == 32
    assert bits == 80.0

    years_to_exhaust = 2.0**bits / 1e9 / (60 * 60 * 24 * 365)
    assert years_to_exhaust > 1e7


def test_a_wrong_code_is_refused_however_many_addresses_try_it(
    client: TestClient, app: FastAPI
) -> None:
    """The end-to-end half: spread across addresses, wrong codes stay wrong.
    Nothing about being distributed makes a guess more likely to land, and
    because each address is fresh, none of these is throttled either, which is
    the same finding as the unit test above seen through the API."""
    outcomes = {attempt(app, WRONG_CODE, f"198.51.100.{host}") for host in range(12)}

    assert 200 not in outcomes
    assert 429 not in outcomes


# ------------------------------------------------- what per-IP limiting protects


def test_an_attacker_cannot_lock_the_class_out(
    client: TestClient, app: FastAPI, storage: FakeObjectStorage
) -> None:
    """The reason the limiter is per address and not global. An attacker burns
    their own address; a student redeeming from theirs is unaffected. A global
    counter would convert a cheap attack into a denial of service against the
    students."""
    headers = professor(client)
    course_id = make_course(client, headers)
    seats = client.post(
        f"/api/v1/courses/{course_id}/seats", json={"count": 2}, headers=headers
    )
    assert seats.status_code == 201, seats.text
    csv_bytes = next(
        data for (_bucket, key), data in storage.objects.items() if key.endswith(".csv")
    )
    real_code = csv_bytes.decode().strip().splitlines()[1].split(",")[1]

    # The attacker exhausts their own address.
    attacker = "203.0.113.99"
    for _ in range(15):
        attempt(app, WRONG_CODE, attacker)
    assert attempt(app, WRONG_CODE, attacker) == 429

    # A student on a different address redeems normally.
    assert attempt(app, real_code, "198.51.100.7") == 200


def test_failure_copy_never_distinguishes_wrong_from_revoked(
    client: TestClient, app: FastAPI, storage: FakeObjectStorage, tmp_path: Path
) -> None:
    """Backend guide 7.1: generic failure messages that do not distinguish
    'no such code' from 'revoked', so redemption cannot be used as an oracle."""
    from app.db.connection import connect

    headers = professor(client)
    course_id = make_course(client, headers)
    client.post(f"/api/v1/courses/{course_id}/seats", json={"count": 1}, headers=headers)
    csv_bytes = next(
        data for (_bucket, key), data in storage.objects.items() if key.endswith(".csv")
    )
    real_code = csv_bytes.decode().strip().splitlines()[1].split(",")[1]

    directory = connect(tmp_path / "directory.db")
    try:
        seat_id_row = directory.execute(
            "SELECT id FROM seats WHERE course_id = ?", (course_id,)
        ).fetchone()
    finally:
        directory.close()
    assert seat_id_row is not None
    revoked = client.post(f"/api/v1/seats/{int(seat_id_row[0])}/revoke", headers=headers)
    assert revoked.status_code == 200, revoked.text

    unknown_response = TestClient(app, client=("192.0.2.1", 40000)).post(
        "/api/v1/seats/redeem", json={"code": WRONG_CODE}
    )
    revoked_response = TestClient(app, client=("192.0.2.2", 40000)).post(
        "/api/v1/seats/redeem", json={"code": real_code}
    )

    assert unknown_response.status_code == revoked_response.status_code
    assert unknown_response.json()["detail"] == revoked_response.json()["detail"]
