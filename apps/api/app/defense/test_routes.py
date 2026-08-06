"""The defence surface: opening a session is the seat's own act on its own
processed submission, the course's concurrency cap is honest about being full,
and the stream is a thin transport shell around the engine that closes with a
verdict and leaves the evidence and transcript behind.

The socket authenticates with the seat's opaque token as a query parameter,
because a browser cannot set headers on a WebSocket; it is the same revocable
credential either way, and a wrong one is indistinguishable from an absent
conversation.
"""

import json
import time
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.db.connection import connect
from app.defense.conftest import (
    FIGURE_BYTES,
    FIGURE_KEY,
    VALID_RUBRIC,
    FakeStorage,
    seed_defensible_submission,
)
from app.defense.model import RecordedTutor, get_tutor
from app.defense.routes import get_stt, get_tts
from app.main import create_app
from app.storage import IMPORTS_BUCKET, get_object_storage

SECRET = "test-secret-not-for-production-0123"
PASSWORD = "a sensible passphrase"

REPLY = "Walk me through why the current is the same in both resistors."


@pytest.fixture()
def storage() -> FakeStorage:
    store = FakeStorage()
    store.objects[(IMPORTS_BUCKET, FIGURE_KEY)] = FIGURE_BYTES
    return store


@pytest.fixture()
def tutor() -> RecordedTutor:
    return RecordedTutor(replies=[REPLY], rubrics=[VALID_RUBRIC])


@pytest.fixture()
def client(
    tmp_path: Path, storage: FakeStorage, tutor: RecordedTutor
) -> Iterator[TestClient]:
    app = create_app(data_dir=tmp_path, jwt_secret=SECRET)
    app.dependency_overrides[get_object_storage] = lambda: storage
    app.dependency_overrides[get_tutor] = lambda: tutor
    # No speech providers configured: the typed path, which is the same loop.
    app.dependency_overrides[get_stt] = lambda: None
    app.dependency_overrides[get_tts] = lambda: None
    with TestClient(app) as c:
        yield c


def professor(client: TestClient, email: str = "prof@example.edu") -> dict[str, str]:
    r = client.post("/api/v1/auth/signup", json={"email": email, "password": PASSWORD})
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def seat_token(
    client: TestClient, headers: dict[str, str], course_id: int, storage: FakeStorage
) -> str:
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
    return str(redeemed.json()["token"])


def seed(tmp_path: Path, course_id: int, **kwargs: Any) -> int:
    conn = connect(tmp_path / "courses" / f"{course_id}.db")
    try:
        submission_id = seed_defensible_submission(conn, **kwargs)
        conn.commit()
        return submission_id
    finally:
        conn.close()


def make_course(client: TestClient, headers: dict[str, str]) -> int:
    r = client.post("/api/v1/courses", json={"title": "EE 201"}, headers=headers)
    assert r.status_code == 201, r.text
    course_id = int(r.json()["id"])
    # One concept through the API, so the shard exists and is migrated before
    # the seeder writes to the file directly.
    created = client.post(
        f"/api/v1/courses/{course_id}/concepts",
        json={"name": "Kirchhoff"},
        headers=headers,
    )
    assert created.status_code == 201, created.text
    return course_id


def setup(
    client: TestClient, tmp_path: Path, storage: FakeStorage, **kwargs: Any
) -> tuple[int, str, int]:
    headers = professor(client)
    course_id = make_course(client, headers)
    token = seat_token(client, headers, course_id, storage)
    submission_id = seed(tmp_path, course_id, **kwargs)
    return course_id, token, submission_id


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_a_seat_opens_a_defence_on_its_own_processed_submission(
    client: TestClient, tmp_path: Path, storage: FakeStorage
) -> None:
    _course_id, token, submission_id = setup(client, tmp_path, storage)

    r = client.post(
        f"/api/v1/submissions/{submission_id}/conversation", headers=auth(token)
    )

    assert r.status_code == 201, r.text
    body = r.json()
    assert body["submission_id"] == submission_id
    assert body["status"] == "active"
    assert body["stream_path"] == (
        f"/api/v1/conversations/{body['conversation_id']}/stream"
    )


def test_another_seats_submission_is_absent(
    client: TestClient, tmp_path: Path, storage: FakeStorage
) -> None:
    _course_id, token, submission_id = setup(client, tmp_path, storage, seat_id=2)

    r = client.post(
        f"/api/v1/submissions/{submission_id}/conversation", headers=auth(token)
    )

    assert r.status_code == 404


def test_a_submission_still_processing_is_not_defensible_yet(
    client: TestClient, tmp_path: Path, storage: FakeStorage
) -> None:
    _course_id, token, submission_id = setup(
        client, tmp_path, storage, status="processing"
    )

    r = client.post(
        f"/api/v1/submissions/{submission_id}/conversation", headers=auth(token)
    )

    assert r.status_code == 409
    assert "transcription" in r.json()["detail"]


def test_the_surface_is_seat_only(
    client: TestClient, tmp_path: Path, storage: FakeStorage
) -> None:
    headers = professor(client)
    course_id = make_course(client, headers)
    token = seat_token(client, headers, course_id, storage)
    submission_id = seed(tmp_path, course_id)

    assert (
        client.post(
            f"/api/v1/submissions/{submission_id}/conversation", headers=headers
        ).status_code
        == 403
    )
    assert (
        client.post(f"/api/v1/submissions/{submission_id}/conversation").status_code
        == 401
    )
    assert (
        client.post(
            f"/api/v1/submissions/{submission_id}/conversation", headers=auth(token)
        ).status_code
        == 201
    )


def test_a_course_at_its_cap_says_so_and_a_stale_session_frees_a_slot(
    client: TestClient, tmp_path: Path, storage: FakeStorage, monkeypatch: Any
) -> None:
    """Concurrency is capped per course (guide 6.5) and the cap is honest: a
    full course gets a 409, never a silent queue. An `active` row nobody ever
    streamed must not hold a slot for ever, so the cap ignores stale ones."""
    monkeypatch.setenv("TIRO_DEFENSE_MAX_CONCURRENT", "1")
    course_id, token, submission_id = setup(client, tmp_path, storage)

    first = client.post(
        f"/api/v1/submissions/{submission_id}/conversation", headers=auth(token)
    )
    assert first.status_code == 201
    second = client.post(
        f"/api/v1/submissions/{submission_id}/conversation", headers=auth(token)
    )
    assert second.status_code == 409
    assert "live conversations" in second.json()["detail"]

    # Age the open session past the staleness horizon: the slot comes back.
    conn = connect(tmp_path / "courses" / f"{course_id}.db")
    try:
        conn.execute(
            "UPDATE conversations SET started_at = ?", (int(time.time()) - 7200,)
        )
        conn.commit()
    finally:
        conn.close()

    third = client.post(
        f"/api/v1/submissions/{submission_id}/conversation", headers=auth(token)
    )
    assert third.status_code == 201


def open_conversation(client: TestClient, token: str, submission_id: int) -> int:
    r = client.post(
        f"/api/v1/submissions/{submission_id}/conversation", headers=auth(token)
    )
    assert r.status_code == 201, r.text
    return int(r.json()["conversation_id"])


def test_the_stream_refuses_without_a_seat_token(
    client: TestClient, tmp_path: Path, storage: FakeStorage
) -> None:
    _course_id, token, submission_id = setup(client, tmp_path, storage)
    conversation_id = open_conversation(client, token, submission_id)

    for query in ["", "?token=not-a-real-token"]:
        path = f"/api/v1/conversations/{conversation_id}/stream{query}"
        with (
            pytest.raises(WebSocketDisconnect) as caught,
            client.websocket_connect(path) as socket,
        ):
            socket.receive_json()
        assert caught.value.code == 4401


def test_another_seats_conversation_is_absent_on_the_stream(
    client: TestClient, tmp_path: Path, storage: FakeStorage
) -> None:
    _course_id, token, submission_id = setup(client, tmp_path, storage)
    conversation_id = open_conversation(client, token, submission_id)

    headers = professor(client, "other@example.edu")  # another course, another seat
    other_course = make_course(client, headers)
    other_token = seat_token(client, headers, other_course, storage)

    path = f"/api/v1/conversations/{conversation_id}/stream?token={other_token}"
    with (
        pytest.raises(WebSocketDisconnect) as caught,
        client.websocket_connect(path) as socket,
    ):
        socket.receive_json()
    assert caught.value.code == 4404


def test_a_typed_defence_streams_and_closes_with_a_verdict(
    client: TestClient, tmp_path: Path, storage: FakeStorage, tutor: RecordedTutor
) -> None:
    """The whole loop through the transport: a turn in, captions out, and on
    close the verdict, the evidence, and the stored transcript."""
    course_id, token, submission_id = setup(client, tmp_path, storage)
    conversation_id = open_conversation(client, token, submission_id)

    events: list[dict[str, Any]] = []
    with client.websocket_connect(
        f"/api/v1/conversations/{conversation_id}/stream?token={token}"
    ) as socket:
        assert socket.receive_json()["type"] == "ready"
        socket.send_json({"type": "text", "text": "I used Ohm's law."})
        while True:
            event = socket.receive_json()
            events.append(event)
            if event["type"] == "reply_done":
                break
        socket.send_json({"type": "end"})
        while True:
            event = socket.receive_json()
            events.append(event)
            if event["type"] == "verdict":
                break

    kinds = [event["type"] for event in events]
    assert kinds.count("turn") == 1
    assert "reply_text" in kinds
    assert kinds[-1] == "verdict"
    assert events[-1]["concept_to_revisit"] == 7
    captions = "".join(
        event.get("text", "") for event in events if event["type"] == "reply_text"
    )
    assert captions == REPLY
    # The tutor saw the figure as pixels and the reference solution in context.
    assert tutor.seen_figures[0] == [FIGURE_BYTES]

    conn = connect(tmp_path / "courses" / f"{course_id}.db")
    try:
        row = conn.execute(
            "SELECT status, rubric_json, concept_to_revisit, turn_count"
            " FROM conversations WHERE id = ?",
            (conversation_id,),
        ).fetchone()
        sources = [
            str(r[0])
            for r in conn.execute("SELECT source FROM evidence_events").fetchall()
        ]
        kinds_logged = sorted(
            str(r[0]) for r in conn.execute("SELECT kind FROM token_usage").fetchall()
        )
    finally:
        conn.close()

    assert row[0] == "closed"
    assert json.loads(str(row[1]))["concept_to_revisit"] == 7
    assert row[3] == 1
    assert sources == ["defense_rubric", "defense_rubric"]
    # Recorded seams spend nothing, but the accounting rows exist either way.
    assert kinds_logged == ["defense_rubric", "defense_tutor"]


def test_no_speech_usage_is_logged_for_a_typed_session(
    client: TestClient, tmp_path: Path, storage: FakeStorage
) -> None:
    """Accounting stays honest in the fallback: a session with no audio and no
    synthesis bills no speech."""
    course_id, token, submission_id = setup(client, tmp_path, storage)
    conversation_id = open_conversation(client, token, submission_id)

    with client.websocket_connect(
        f"/api/v1/conversations/{conversation_id}/stream?token={token}"
    ) as socket:
        assert socket.receive_json()["type"] == "ready"
        socket.send_json({"type": "end"})
        while socket.receive_json()["type"] != "verdict":
            continue

    conn = connect(tmp_path / "courses" / f"{course_id}.db")
    try:
        speech = conn.execute("SELECT COUNT(*) FROM speech_usage").fetchone()[0]
    finally:
        conn.close()

    assert speech == 0
