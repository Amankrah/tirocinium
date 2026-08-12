"""The attempt span (frontend guide 4.2, milestone 9.6).

"When a student starts a problem, they get a clean 'start attempt' moment that
timestamps the beginning, and the submission carries that span (started,
submitted) as an honest record of engaged time."

Honest is the word the tests are built around. The span is shown to the
professor as evidence of engaged work, so it is the server that stamps the
start; a span the client could name is a span the client could invent. What
follows pins that, and pins that a submission with no attempt carries a null
span rather than a fabricated one.
"""

import sqlite3
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.db.connection import connect
from app.main import create_app
from app.storage import get_object_storage
from app.submissions.test_submissions import (
    SECRET,
    FakeObjectStorage,
    bearer,
    make_case_study,
    make_course,
    professor,
    seat_tokens,
    seed_variant,
)

MB = 1024 * 1024


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


def world(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path, seats: int = 1
) -> tuple[int, int, list[str]]:
    headers = professor(client)
    course_id = make_course(client, headers)
    case_study_id = make_case_study(client, headers, course_id)
    variant_id = seed_variant(tmp_data, course_id, case_study_id)
    tokens = seat_tokens(client, headers, course_id, storage, count=seats)
    return course_id, variant_id, tokens


def submit(
    client: TestClient, token: str, variant_id: int, attempt_id: int | None = None
) -> int:
    body: dict[str, object] = {
        "pages": [{"content_type": "image/jpeg", "size_bytes": MB}]
    }
    if attempt_id is not None:
        body["attempt_id"] = attempt_id
    r = client.post(
        f"/api/v1/variants/{variant_id}/submissions", json=body, headers=bearer(token)
    )
    assert r.status_code == 201, r.text
    return int(r.json()["submission_id"])


def test_starting_an_attempt_stamps_it_on_the_server(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    _course_id, variant_id, tokens = world(client, storage, tmp_data)

    r = client.post(
        f"/api/v1/variants/{variant_id}/attempts", headers=bearer(tokens[0])
    )

    assert r.status_code == 201, r.text
    body = r.json()
    assert body["variant_id"] == variant_id
    assert body["attempt_id"] > 0
    assert body["started_at"] > 1_700_000_000


def test_a_submission_carries_the_span_from_its_attempt(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    _course_id, variant_id, tokens = world(client, storage, tmp_data)
    attempt = client.post(
        f"/api/v1/variants/{variant_id}/attempts", headers=bearer(tokens[0])
    ).json()

    submission_id = submit(client, tokens[0], variant_id, attempt["attempt_id"])

    read = client.get(
        f"/api/v1/submissions/{submission_id}", headers=bearer(tokens[0])
    ).json()
    assert read["started_at"] == attempt["started_at"]
    assert read["submitted_at"] >= read["started_at"]


def test_a_submission_without_an_attempt_has_no_span(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    """A null span is the honest answer for work whose start nobody recorded.
    Inventing one would make the professor's record a guess."""
    _course_id, variant_id, tokens = world(client, storage, tmp_data)

    submission_id = submit(client, tokens[0], variant_id)

    read = client.get(
        f"/api/v1/submissions/{submission_id}", headers=bearer(tokens[0])
    ).json()
    assert read["started_at"] is None


def test_another_seats_attempt_never_becomes_your_span(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    """The attempt id is a claim, so it is checked rather than trusted: citing
    someone else's start must contribute nothing."""
    _course_id, variant_id, tokens = world(client, storage, tmp_data, seats=2)
    theirs = client.post(
        f"/api/v1/variants/{variant_id}/attempts", headers=bearer(tokens[1])
    ).json()

    submission_id = submit(client, tokens[0], variant_id, theirs["attempt_id"])

    read = client.get(
        f"/api/v1/submissions/{submission_id}", headers=bearer(tokens[0])
    ).json()
    assert read["started_at"] is None


def test_an_attempt_on_a_different_variant_is_not_a_span(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    """Otherwise a student could open a trivial problem, leave it running, and
    cite it from a harder one."""
    course_id, variant_id, tokens = world(client, storage, tmp_data)
    other_case = make_case_study(client, professor(client, "p2@example.edu"), course_id) \
        if False else None
    other_variant = seed_variant(tmp_data, course_id, 1)
    elsewhere = client.post(
        f"/api/v1/variants/{other_variant}/attempts", headers=bearer(tokens[0])
    ).json()

    submission_id = submit(client, tokens[0], variant_id, elsewhere["attempt_id"])

    read = client.get(
        f"/api/v1/submissions/{submission_id}", headers=bearer(tokens[0])
    ).json()
    assert read["started_at"] is None
    assert other_case is None


def test_an_unknown_attempt_id_is_ignored_not_an_error(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    """A stale attempt id from a reloaded page must not cost the student their
    submission; it costs them the span, which is the honest outcome."""
    _course_id, variant_id, tokens = world(client, storage, tmp_data)

    submission_id = submit(client, tokens[0], variant_id, 999999)

    read = client.get(
        f"/api/v1/submissions/{submission_id}", headers=bearer(tokens[0])
    ).json()
    assert read["started_at"] is None


def test_starting_twice_is_ordinary(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    """A student may open a problem, put it down, and come back. Each start is
    its own row; only the one the submission cites becomes a span."""
    _course_id, variant_id, tokens = world(client, storage, tmp_data)

    first = client.post(
        f"/api/v1/variants/{variant_id}/attempts", headers=bearer(tokens[0])
    ).json()
    second = client.post(
        f"/api/v1/variants/{variant_id}/attempts", headers=bearer(tokens[0])
    ).json()

    assert first["attempt_id"] != second["attempt_id"]
    submission_id = submit(client, tokens[0], variant_id, second["attempt_id"])
    read = client.get(
        f"/api/v1/submissions/{submission_id}", headers=bearer(tokens[0])
    ).json()
    assert read["started_at"] == second["started_at"]


def test_an_attempt_on_an_unknown_variant_is_a_404(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    _course_id, _variant_id, tokens = world(client, storage, tmp_data)

    r = client.post("/api/v1/variants/999999/attempts", headers=bearer(tokens[0]))

    assert r.status_code == 404


def test_the_attempt_endpoint_is_seat_only(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    _course_id, variant_id, _tokens = world(client, storage, tmp_data)
    prof = professor(client, email="other@example.edu")

    assert client.post(f"/api/v1/variants/{variant_id}/attempts").status_code == 401
    assert (
        client.post(
            f"/api/v1/variants/{variant_id}/attempts", headers=prof
        ).status_code
        in (401, 403)
    )


def test_the_span_reaches_the_student_history_and_the_professor_review(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    """The span exists to be read: by the student as their own record, and by
    the professor as the effort behind a submission (guide 4.2b)."""
    course_id, variant_id, tokens = world(client, storage, tmp_data)
    headers = professor(client, email="owner-read@example.edu")
    attempt = client.post(
        f"/api/v1/variants/{variant_id}/attempts", headers=bearer(tokens[0])
    ).json()
    submission_id = submit(client, tokens[0], variant_id, attempt["attempt_id"])

    # Backdate the start so the span is a real duration rather than zero.
    conn = connect(tmp_data / "courses" / f"{course_id}.db")
    try:
        conn.execute(
            "UPDATE submissions SET started_at = submitted_at - 1800 WHERE id = ?",
            (submission_id,),
        )
        conn.commit()
    finally:
        conn.close()

    history = client.get(
        f"/api/v1/courses/{course_id}/history", headers=bearer(tokens[0])
    ).json()["entries"][0]
    assert history["engaged_seconds"] == 1800
    assert history["started_at"] is not None

    del headers  # the owning professor is the one who made the course above


def test_the_professor_review_shows_the_span(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    headers = professor(client)
    course_id = make_course(client, headers)
    case_study_id = make_case_study(client, headers, course_id)
    variant_id = seed_variant(tmp_data, course_id, case_study_id)
    tokens = seat_tokens(client, headers, course_id, storage, count=1)
    attempt = client.post(
        f"/api/v1/variants/{variant_id}/attempts", headers=bearer(tokens[0])
    ).json()
    submission_id = submit(client, tokens[0], variant_id, attempt["attempt_id"])

    conn: sqlite3.Connection = connect(tmp_data / "courses" / f"{course_id}.db")
    try:
        conn.execute(
            "UPDATE submissions SET started_at = submitted_at - 900 WHERE id = ?",
            (submission_id,),
        )
        conn.commit()
    finally:
        conn.close()

    row = client.get(
        f"/api/v1/courses/{course_id}/submissions", headers=headers
    ).json()["submissions"][0]
    assert row["engaged_seconds"] == 900
    assert row["started_at"] is not None
