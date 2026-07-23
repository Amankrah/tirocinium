"""Milestone 1.4: professor auth. Signup, login, short-lived JWTs, the
authorization dependency layer, and the generic-failure discipline (backend
guide 7.1)."""

from collections.abc import Iterator
from pathlib import Path

import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.auth.deps import require_admin, require_professor
from app.auth.models import Identity, Role
from app.auth.tokens import TokenError, decode_token, issue_token
from app.db.connection import connect
from app.main import create_app

SECRET = "test-secret-not-for-production-0123"
PASSWORD = "a sensible passphrase"


@pytest.fixture()
def client(tmp_path: Path) -> Iterator[TestClient]:
    with TestClient(create_app(data_dir=tmp_path, jwt_secret=SECRET)) as c:
        yield c


def signup(
    client: TestClient,
    email: str = "prof@example.edu",
    password: str = PASSWORD,
) -> httpx.Response:
    response: httpx.Response = client.post(
        "/api/v1/auth/signup", json={"email": email, "password": password}
    )
    return response


def test_signup_returns_working_token(client: TestClient) -> None:
    r = signup(client)
    assert r.status_code == 201
    body = r.json()
    assert body["professor"]["email"] == "prof@example.edu"
    assert body["professor"]["role"] == "professor"
    me = client.get(
        "/api/v1/auth/me", headers={"Authorization": f"Bearer {body['token']}"}
    )
    assert me.status_code == 200
    assert me.json()["email"] == "prof@example.edu"
    assert me.json()["role"] == "professor"


def test_duplicate_email_is_conflict_problem(client: TestClient) -> None:
    assert signup(client).status_code == 201
    r = signup(client)
    assert r.status_code == 409
    assert r.headers["content-type"].startswith("application/problem+json")
    assert r.json()["status"] == 409


def test_email_uniqueness_is_case_insensitive(client: TestClient) -> None:
    assert signup(client, email="Prof@Example.EDU").status_code == 201
    assert signup(client, email="prof@example.edu").status_code == 409
    r = client.post(
        "/api/v1/auth/login",
        json={"email": "PROF@example.edu", "password": PASSWORD},
    )
    assert r.status_code == 200


def test_login_roundtrip(client: TestClient) -> None:
    signup(client)
    r = client.post(
        "/api/v1/auth/login",
        json={"email": "prof@example.edu", "password": PASSWORD},
    )
    assert r.status_code == 200
    me = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {r.json()['token']}"},
    )
    assert me.status_code == 200


def test_bad_credentials_are_generic_and_identical(client: TestClient) -> None:
    """Wrong password and unknown email must be indistinguishable: same
    status, same body, problem+json."""
    signup(client)
    wrong_pw = client.post(
        "/api/v1/auth/login",
        json={"email": "prof@example.edu", "password": "not the password"},
    )
    unknown = client.post(
        "/api/v1/auth/login",
        json={"email": "nobody@example.edu", "password": PASSWORD},
    )
    assert wrong_pw.status_code == unknown.status_code == 401
    assert wrong_pw.json() == unknown.json()
    assert wrong_pw.headers["content-type"].startswith("application/problem+json")


def test_me_requires_a_valid_token(client: TestClient) -> None:
    assert client.get("/api/v1/auth/me").status_code == 401
    garbage = client.get(
        "/api/v1/auth/me", headers={"Authorization": "Bearer not.a.jwt"}
    )
    assert garbage.status_code == 401
    forged = issue_token(
        secret="some-other-secret", user_id=1, role=Role.PROFESSOR, email="x@y.z"
    )
    tampered = client.get(
        "/api/v1/auth/me", headers={"Authorization": f"Bearer {forged}"}
    )
    assert tampered.status_code == 401


def test_expired_token_rejected(client: TestClient) -> None:
    signup(client)
    stale = issue_token(
        secret=SECRET,
        user_id=1,
        role=Role.PROFESSOR,
        email="prof@example.edu",
        ttl_seconds=-10,
    )
    r = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {stale}"})
    assert r.status_code == 401


def test_seat_role_jwt_is_rejected(client: TestClient) -> None:
    """Seats authenticate with opaque tokens (1.5), never JWTs; a JWT
    claiming the seat role has no legitimate issuer and is refused."""
    forged = issue_token(secret=SECRET, user_id=99, role=Role.SEAT)
    r = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {forged}"})
    assert r.status_code == 401


def test_short_password_rejected(client: TestClient) -> None:
    assert signup(client, password="short").status_code == 422


def test_password_stored_as_argon2id(client: TestClient, tmp_path: Path) -> None:
    signup(client)
    conn = connect(tmp_path / "directory.db", readonly=True)
    try:
        stored = conn.execute("SELECT password_hash FROM users").fetchone()[0]
    finally:
        conn.close()
    assert stored.startswith("$argon2id$")
    assert PASSWORD not in stored


def test_token_claims_roundtrip() -> None:
    token = issue_token(
        secret=SECRET, user_id=7, role=Role.ADMIN, email="a@b.c", ttl_seconds=60
    )
    claims = decode_token(token, SECRET)
    assert claims.sub == "7"
    assert claims.role == Role.ADMIN
    with pytest.raises(TokenError):
        decode_token(token, "wrong-secret")


def test_role_gates() -> None:
    prof = Identity(role=Role.PROFESSOR, user_id=1, email="p@x.y")
    admin = Identity(role=Role.ADMIN, user_id=2, email="a@x.y")
    assert require_professor(prof) is prof
    assert require_professor(admin) is admin
    assert require_admin(admin) is admin
    with pytest.raises(HTTPException) as exc:
        require_admin(prof)
    assert exc.value.status_code == 403
