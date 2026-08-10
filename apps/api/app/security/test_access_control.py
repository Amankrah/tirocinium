"""OWASP A01, broken access control, asserted across the whole surface
(milestone 9.2).

Every per-module test suite already covers its own authorization rules. What
this adds is the property those tests cannot give individually: that *no route
anywhere* is reachable without credentials. It walks the live application's
route table rather than the committed OpenAPI spec, so a route added today is
covered before anyone regenerates the contract, and the set of deliberately
public routes is written out in full, so opening a new one is an edit to this
file and therefore a decision somebody made on purpose.

The rest of the file covers the token-level failures that sit underneath every
route: a tampered signature, an expired token, an opaque seat token presented
where a professor JWT belongs and the reverse, and a revoked seat's token
dying immediately rather than at expiry.
"""

import time
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import jwt
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.main import create_app
from app.storage import get_object_storage
from app.submissions.test_submissions import (
    FakeObjectStorage,
    bearer,
    make_course,
    professor,
    seat_tokens,
)

SECRET = "security-suite-secret-0123456789abcdef"

# The only routes that may be reached without credentials, and why. Anything
# else answering something other than 401 is a finding, and adding to this set
# is a deliberate act.
PUBLIC_ROUTES: set[tuple[str, str]] = {
    ("GET", "/api/v1/health"),  # liveness, no data
    ("POST", "/api/v1/auth/signup"),  # creates the credential
    ("POST", "/api/v1/auth/login"),  # exchanges the credential
    ("POST", "/api/v1/seats/redeem"),  # exchanges the seat code, rate limited
}

# Path parameters are filled with a value that exists nowhere, so a route that
# does reach its handler fails on lookup rather than mutating anything.
_PARAM_FILL = "424242"


@pytest.fixture()
def storage() -> FakeObjectStorage:
    return FakeObjectStorage()


@pytest.fixture()
def tmp_data(tmp_path: Path) -> Path:
    return tmp_path


@pytest.fixture()
def app(tmp_data: Path, storage: FakeObjectStorage) -> FastAPI:
    built = create_app(data_dir=tmp_data, jwt_secret=SECRET)
    built.dependency_overrides[get_object_storage] = lambda: storage
    return built


@pytest.fixture()
def client(app: FastAPI) -> Iterator[TestClient]:
    with TestClient(app) as c:
        yield c


def api_routes(app: FastAPI) -> list[tuple[str, str]]:
    """Every (method, path) the application serves under /api/v1, HEAD and
    OPTIONS excluded because Starlette adds them itself.

    Included routers are wrapped rather than flattened in this FastAPI version,
    so the walk follows each wrapper's `original_router`; a sweep that only
    looked at the top level would find four routes and pass while proving
    nothing, which is why the caller also asserts the count is plausible."""
    found: list[tuple[str, str]] = []

    def walk(routes: Any, prefix: str = "") -> None:
        for route in routes:
            included = getattr(route, "original_router", None)
            if included is not None:
                context = getattr(route, "include_context", None)
                walk(included.routes, prefix + getattr(context, "prefix", ""))
                continue
            nested = getattr(route, "routes", None)
            if nested:
                walk(nested, prefix)
                continue
            path = prefix + getattr(route, "path", "")
            methods = getattr(route, "methods", None)
            if not methods or not path.startswith("/api/v1"):
                continue
            for method in sorted(set(methods) - {"HEAD", "OPTIONS"}):
                found.append((method, path))

    walk(app.routes)
    return sorted(set(found))


def concrete(path: str) -> str:
    parts = path.split("/")
    return "/".join(_PARAM_FILL if p.startswith("{") else p for p in parts)


def test_every_route_is_either_public_by_decision_or_requires_credentials(
    client: TestClient, app: FastAPI
) -> None:
    """The sweep. A new route that forgets its auth dependency fails here."""
    routes = api_routes(app)
    assert len(routes) > 50, "the route table looks truncated"

    unprotected: list[tuple[int, str, str]] = []
    for method, path in routes:
        if (method, path) in PUBLIC_ROUTES:
            continue
        response = client.request(method, concrete(path), json={})
        if response.status_code != 401:
            unprotected.append((response.status_code, method, path))

    assert not unprotected, f"routes reachable without credentials: {unprotected}"


def test_the_public_route_set_is_exactly_what_we_intend(app: FastAPI) -> None:
    """Guards the guard: if PUBLIC_ROUTES drifts from the application, or a
    public route disappears, this says so rather than silently weakening the
    sweep above."""
    served = set(api_routes(app))
    assert served >= PUBLIC_ROUTES, PUBLIC_ROUTES - served


def test_the_defence_socket_refuses_an_unauthenticated_connection(
    client: TestClient,
) -> None:
    """The WebSocket is not an APIRoute, so the sweep cannot see it; it gets
    its own assertion. It authenticates by query parameter because a browser
    cannot set headers on a socket, and closes with 4401 rather than
    completing the handshake."""
    from starlette.websockets import WebSocketDisconnect

    with pytest.raises(WebSocketDisconnect) as caught, client.websocket_connect(
        "/api/v1/conversations/1/stream"
    ):
        pass
    assert caught.value.code == 4401


# --------------------------------------------------------------- token failures


def test_a_tampered_professor_token_is_refused(client: TestClient) -> None:
    headers = professor(client)
    good = headers["Authorization"].split(" ", 1)[1]
    tampered = good[:-2] + ("ab" if not good.endswith("ab") else "cd")

    response = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {tampered}"})
    assert response.status_code == 401


def test_a_token_signed_with_another_secret_is_refused(client: TestClient) -> None:
    """The signature is the whole control; a valid-looking claim set signed by
    someone else must not open anything."""
    forged = jwt.encode(
        {"sub": "1", "role": "professor", "exp": int(time.time()) + 3600},
        "not-the-servers-secret",
        algorithm="HS256",
    )

    response = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {forged}"})
    assert response.status_code == 401


def test_an_expired_professor_token_is_refused(client: TestClient) -> None:
    expired = jwt.encode(
        {"sub": "1", "role": "professor", "exp": int(time.time()) - 60},
        SECRET,
        algorithm="HS256",
    )

    response = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {expired}"})
    assert response.status_code == 401


def test_an_algorithm_none_token_is_refused(client: TestClient) -> None:
    """The classic JWT forgery: claim the token is unsigned. PyJWT must not be
    persuaded to accept it."""
    unsigned = jwt.encode(
        {"sub": "1", "role": "professor", "exp": int(time.time()) + 3600},
        key="",
        algorithm="none",
    )

    response = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {unsigned}"})
    assert response.status_code == 401


def test_a_seat_token_does_not_open_a_professor_surface(
    client: TestClient, storage: FakeObjectStorage
) -> None:
    headers = professor(client)
    course_id = make_course(client, headers)
    token = seat_tokens(client, headers, course_id, storage, count=1)[0]

    for path in (
        "/api/v1/courses",
        f"/api/v1/courses/{course_id}/seats",
        f"/api/v1/courses/{course_id}/reports/activity",
        f"/api/v1/courses/{course_id}/mastery/distribution",
    ):
        response = client.get(path, headers=bearer(token))
        assert response.status_code in (401, 403), f"{path} accepted a seat token"


def test_a_professor_token_does_not_open_a_seat_surface(
    client: TestClient, storage: FakeObjectStorage
) -> None:
    headers = professor(client)
    course_id = make_course(client, headers)

    for path in (
        "/api/v1/seats/me",
        f"/api/v1/courses/{course_id}/mastery",
        f"/api/v1/courses/{course_id}/revisit",
        f"/api/v1/courses/{course_id}/history",
    ):
        response = client.get(path, headers=headers)
        assert response.status_code in (401, 403), f"{path} accepted a professor token"


def test_a_revoked_seat_token_dies_at_once(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    """Revocation is the reason seat sessions are opaque and server-side
    rather than JWTs: it must take effect now, not at expiry."""
    from app.db.connection import connect

    headers = professor(client)
    course_id = make_course(client, headers)
    token = seat_tokens(client, headers, course_id, storage, count=1)[0]
    assert client.get("/api/v1/seats/me", headers=bearer(token)).status_code == 200

    directory = connect(tmp_data / "directory.db")
    try:
        seat_id = int(
            directory.execute(
                "SELECT id FROM seats WHERE course_id = ?", (course_id,)
            ).fetchone()[0]
        )
    finally:
        directory.close()
    revoked = client.post(f"/api/v1/seats/{seat_id}/revoke", headers=headers)
    assert revoked.status_code == 200, revoked.text

    assert client.get("/api/v1/seats/me", headers=bearer(token)).status_code == 401


def test_a_bare_or_malformed_authorization_header_is_refused(client: TestClient) -> None:
    for value in ("", "Bearer", "Bearer ", "Basic abc", "Bearer a.b.c", "token abc"):
        response = client.get("/api/v1/auth/me", headers={"Authorization": value})
        assert response.status_code == 401, value


def test_auth_failures_never_say_which_half_was_wrong(client: TestClient) -> None:
    """OWASP A07: the login response must not distinguish an unknown account
    from a wrong password, in body or in status."""
    client.post(
        "/api/v1/auth/signup",
        json={"email": "known@example.edu", "password": "a sensible passphrase"},
    )
    unknown = client.post(
        "/api/v1/auth/login",
        json={"email": "nobody@example.edu", "password": "a sensible passphrase"},
    )
    wrong_password = client.post(
        "/api/v1/auth/login",
        json={"email": "known@example.edu", "password": "the wrong passphrase"},
    )

    assert unknown.status_code == wrong_password.status_code
    assert unknown.json()["detail"] == wrong_password.json()["detail"]


def test_a_seat_code_never_appears_in_an_error_body(client: TestClient) -> None:
    """Codes are credentials: a failed redemption must not echo the attempt."""
    attempt = "MK4T-9RWF-C2HP-X6ZD"

    response = client.post("/api/v1/seats/redeem", json={"code": attempt})

    assert response.status_code in (401, 404, 429)
    body = response.text
    assert attempt not in body
    assert "MK4T" not in body


def test_the_error_body_never_leaks_a_stack_trace_or_sql(
    client: TestClient, storage: FakeObjectStorage
) -> None:
    """OWASP A05: errors are RFC 7807 problem details, not internals."""
    headers = professor(client)
    course_id = make_course(client, headers)

    response = client.get(f"/api/v1/courses/{course_id}/case-studies/999999", headers=headers)

    assert response.status_code == 404
    body: dict[str, Any] = response.json()
    assert set(body) >= {"type", "title", "status"}
    text = response.text.lower()
    for leak in ("traceback", "sqlite3", "select ", "/home/", "app/"):
        assert leak not in text, f"error body leaks {leak!r}"
