"""The unfold and history surfaces (milestone 8.4).

Two properties carry this milestone. The solution is earned, not browsed: a
seat reaches it by having submitted or by deliberately giving up, and giving up
is recorded as what it is. And the numbering the student unfolds is the
numbering the tutor is given, so a step sent into the defence lands where the
student meant it and the tutor's never-reveal rule has a precise line.
"""

import json
import logging
import sqlite3
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.compression import compress_text
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
    request_upload,
    seat_tokens,
)

MB = 1024 * 1024
SOLUTION = (
    "Apply Ohm's law to the loop.\n\n"
    "Substitute the supply voltage.\n\n"
    "Convert the result to milliamps.\n"
)


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


class World:
    def __init__(
        self,
        headers: dict[str, str],
        course_id: int,
        case_study_id: int,
        variant_id: int,
        tokens: list[str],
    ) -> None:
        self.headers = headers
        self.course_id = course_id
        self.case_study_id = case_study_id
        self.variant_id = variant_id
        self.tokens = tokens


def seed_variant_with_solution(
    tmp_data: Path, course_id: int, case_study_id: int, solution: str = SOLUTION
) -> int:
    conn = connect(tmp_data / "courses" / f"{course_id}.db")
    try:
        cur = conn.execute(
            "INSERT INTO variants (case_study_id, seed_json_z, body_z, solution_z,"
            " verification, model_id, created_at)"
            " VALUES (?, ?, ?, ?, 'verified', 'test-model', 1750000000)",
            (
                case_study_id,
                compress_text(conn, "problem_text", '{"seed": 1}'),
                compress_text(conn, "problem_text", "# variant body"),
                # Stored the way the 5.3 loop stores it: JSON carrying the markdown.
                compress_text(
                    conn,
                    "problem_text",
                    json.dumps({"solution_md": solution, "final_answers": ["2.553 mA"]}),
                ),
            ),
        )
        conn.commit()
        assert cur.lastrowid is not None
        return int(cur.lastrowid)
    finally:
        conn.close()


def publish(client: TestClient, headers: dict[str, str], course_id: int, case_id: int) -> None:
    r = client.post(
        f"/api/v1/courses/{course_id}/case-studies/{case_id}/publish", headers=headers
    )
    assert r.status_code in (200, 204), r.text


def build_world(
    client: TestClient,
    storage: FakeObjectStorage,
    tmp_data: Path,
    seats: int = 1,
    published: bool = True,
) -> World:
    headers = professor(client)
    course_id = make_course(client, headers)
    case_study_id = make_case_study(client, headers, course_id)
    variant_id = seed_variant_with_solution(tmp_data, course_id, case_study_id)
    if published:
        publish(client, headers, course_id, case_study_id)
    tokens = seat_tokens(client, headers, course_id, storage, count=seats)
    return World(headers, course_id, case_study_id, variant_id, tokens)


def submit(client: TestClient, token: str, variant_id: int) -> int:
    r = request_upload(
        client, token, variant_id, [{"content_type": "image/jpeg", "size_bytes": MB}]
    )
    assert r.status_code == 201, r.text
    return int(r.json()["submission_id"])


def unfold_url(world: World) -> str:
    return f"/api/v1/courses/{world.course_id}/variants/{world.variant_id}/solution"


def shard(tmp_data: Path, course_id: int) -> sqlite3.Connection:
    return connect(tmp_data / "courses" / f"{course_id}.db")


# --------------------------------------------------------------- the gate


def test_a_seat_who_has_not_worked_cannot_read_the_solution(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    """The solution is earned. The copy says what to do next rather than
    scolding, per the frontend guide's error rules."""
    world = build_world(client, storage, tmp_data)

    r = client.get(unfold_url(world), headers=bearer(world.tokens[0]))

    assert r.status_code == 403
    assert "submitted" in r.json()["detail"]
    assert "give up" in r.json()["detail"]


def test_submitting_opens_the_solution_but_reveals_nothing_yet(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    world = build_world(client, storage, tmp_data)
    submit(client, world.tokens[0], world.variant_id)

    body = client.get(unfold_url(world), headers=bearer(world.tokens[0])).json()

    assert body["total_steps"] == 3
    assert body["steps_revealed"] == 0
    assert body["steps"] == []
    assert body["gave_up"] is False


def test_unfolding_reveals_step_by_step(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    world = build_world(client, storage, tmp_data)
    submit(client, world.tokens[0], world.variant_id)

    first = client.post(
        f"{unfold_url(world)}/reveal",
        json={"through_step": 1},
        headers=bearer(world.tokens[0]),
    ).json()
    assert first["steps_revealed"] == 1
    assert [s["number"] for s in first["steps"]] == [1]
    assert first["steps"][0]["markdown"] == "Apply Ohm's law to the loop."
    # The rest is genuinely absent, not merely hidden by the client.
    assert "Substitute the supply voltage." not in json.dumps(first)

    second = client.post(
        f"{unfold_url(world)}/reveal",
        json={"through_step": 2},
        headers=bearer(world.tokens[0]),
    ).json()
    assert [s["number"] for s in second["steps"]] == [1, 2]
    assert second["steps"][1]["markdown"] == "Substitute the supply voltage."


def test_unfolding_never_rewinds_and_a_retry_is_harmless(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    """The target is absolute, so an out-of-order or repeated call cannot take
    back what the student has already read."""
    world = build_world(client, storage, tmp_data)
    submit(client, world.tokens[0], world.variant_id)
    headers = bearer(world.tokens[0])

    client.post(f"{unfold_url(world)}/reveal", json={"through_step": 3}, headers=headers)
    back = client.post(
        f"{unfold_url(world)}/reveal", json={"through_step": 1}, headers=headers
    ).json()

    assert back["steps_revealed"] == 3
    again = client.post(
        f"{unfold_url(world)}/reveal", json={"through_step": 3}, headers=headers
    ).json()
    assert again["steps_revealed"] == 3


def test_unfolding_past_the_end_stops_at_the_last_step(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    world = build_world(client, storage, tmp_data)
    submit(client, world.tokens[0], world.variant_id)

    body = client.post(
        f"{unfold_url(world)}/reveal",
        json={"through_step": 99},
        headers=bearer(world.tokens[0]),
    ).json()

    assert body["steps_revealed"] == 3
    assert body["total_steps"] == 3
    assert len(body["steps"]) == 3


def test_giving_up_without_submitting_is_recorded_as_giving_up(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    """A student may always reach the solution, and the platform never
    pretends it was earned by work that did not happen."""
    world = build_world(client, storage, tmp_data)

    body = client.post(
        f"{unfold_url(world)}/reveal",
        json={"through_step": 1},
        headers=bearer(world.tokens[0]),
    ).json()

    assert body["gave_up"] is True
    assert body["steps_revealed"] == 1
    # And the read is open from now on.
    assert client.get(unfold_url(world), headers=bearer(world.tokens[0])).status_code == 200

    conn = shard(tmp_data, world.course_id)
    try:
        row = conn.execute(
            "SELECT gave_up, steps_revealed FROM solution_reveals"
        ).fetchone()
        assert (int(row[0]), int(row[1])) == (1, 1)
    finally:
        conn.close()


def test_submitting_first_is_not_recorded_as_giving_up(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    world = build_world(client, storage, tmp_data)
    submit(client, world.tokens[0], world.variant_id)

    body = client.post(
        f"{unfold_url(world)}/reveal",
        json={"through_step": 1},
        headers=bearer(world.tokens[0]),
    ).json()

    assert body["gave_up"] is False


def test_one_seats_unfolding_does_not_open_anothers(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    world = build_world(client, storage, tmp_data, seats=2)
    submit(client, world.tokens[0], world.variant_id)
    client.post(
        f"{unfold_url(world)}/reveal",
        json={"through_step": 3},
        headers=bearer(world.tokens[0]),
    )

    other = client.get(unfold_url(world), headers=bearer(world.tokens[1]))
    assert other.status_code == 403


def test_a_professor_owner_sees_the_whole_solution(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    """They wrote it; the unfold is a student ritual, not a wall against the
    author."""
    world = build_world(client, storage, tmp_data)

    body = client.get(unfold_url(world), headers=world.headers).json()

    assert body["total_steps"] == 3
    assert body["steps_revealed"] == 3
    assert len(body["steps"]) == 3


def test_a_seat_cannot_reach_an_unpublished_variants_solution(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    world = build_world(client, storage, tmp_data, published=False)
    submit(client, world.tokens[0], world.variant_id)

    r = client.get(unfold_url(world), headers=bearer(world.tokens[0]))
    assert r.status_code == 404


def test_the_unfold_surface_is_authenticated(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    world = build_world(client, storage, tmp_data)
    stranger = professor(client, email="other@example.edu")

    assert client.get(unfold_url(world)).status_code == 401
    assert client.get(unfold_url(world), headers=stranger).status_code == 403


# -------------------------------------------------------- shared numbering


def test_the_tutor_is_told_how_far_the_student_has_unfolded(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    """The integration that makes send-to-conversation coherent: the tutor's
    context numbers the same steps and states the line between what the
    student has read and what it must not volunteer."""
    from app.defense.context import context_document

    document = context_document("body", SOLUTION, "my working", [(7, "Ohm")], 1)

    assert "[step 1]" in document
    assert "[step 2]" in document
    assert "unfolded steps 1 to 1 of 3" in document
    assert "Steps 2 onward are unrevealed" in document
    # The tutor still receives the whole solution: it is ground truth, and the
    # restraint is a rule it follows, not a truncation it is handed.
    assert "Convert the result to milliamps." in document


def test_the_tutor_is_told_when_nothing_has_been_unfolded(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    from app.defense.context import context_document

    document = context_document("body", SOLUTION, "my working", [], 0)

    assert "unfolded none of the 3 steps" in document
    assert "Every step is unrevealed" in document


# -------------------------------------------------------------------- history


def test_history_lists_the_seats_own_work_newest_first(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    world = build_world(client, storage, tmp_data)
    first = submit(client, world.tokens[0], world.variant_id)
    second = submit(client, world.tokens[0], world.variant_id)
    client.post(
        f"/api/v1/courses/{world.course_id}/submissions/{first}/grade",
        json={"score": 0.8},
        headers=world.headers,
    )
    client.post(
        f"{unfold_url(world)}/reveal",
        json={"through_step": 2},
        headers=bearer(world.tokens[0]),
    )

    body = client.get(
        f"/api/v1/courses/{world.course_id}/history", headers=bearer(world.tokens[0])
    ).json()

    assert [e["submission_id"] for e in body["entries"]] == [second, first]
    graded = next(e for e in body["entries"] if e["submission_id"] == first)
    assert graded["grade"] == 0.8
    assert graded["case_study_title"] == "NPV"
    assert graded["defended"] is False
    assert graded["solution_unfolded"] is True


def test_history_shows_only_the_seats_own_submissions(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    world = build_world(client, storage, tmp_data, seats=2)
    mine = submit(client, world.tokens[0], world.variant_id)
    theirs = submit(client, world.tokens[1], world.variant_id)

    body = client.get(
        f"/api/v1/courses/{world.course_id}/history", headers=bearer(world.tokens[0])
    ).json()

    ids = [e["submission_id"] for e in body["entries"]]
    assert ids == [mine]
    assert theirs not in ids


def test_history_paginates_backwards(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    world = build_world(client, storage, tmp_data)
    ids = [submit(client, world.tokens[0], world.variant_id) for _ in range(3)]
    headers = bearer(world.tokens[0])

    first = client.get(
        f"/api/v1/courses/{world.course_id}/history?limit=2", headers=headers
    ).json()
    assert [e["submission_id"] for e in first["entries"]] == [ids[2], ids[1]]

    second = client.get(
        f"/api/v1/courses/{world.course_id}/history?limit=2"
        f"&cursor={first['next_cursor']}",
        headers=headers,
    ).json()
    assert [e["submission_id"] for e in second["entries"]] == [ids[0]]
    assert second["next_cursor"] is None


def test_history_is_seat_only(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    """A professor reads the class through the reporting surfaces, never a
    student's own view."""
    world = build_world(client, storage, tmp_data)
    path = f"/api/v1/courses/{world.course_id}/history"

    assert client.get(path).status_code == 401
    assert client.get(path, headers=world.headers).status_code == 403


def test_the_unfold_and_history_name_no_student(
    client: TestClient,
    storage: FakeObjectStorage,
    tmp_data: Path,
    caplog: pytest.LogCaptureFixture,
) -> None:
    caplog.set_level(logging.DEBUG)
    world = build_world(client, storage, tmp_data)
    submit(client, world.tokens[0], world.variant_id)
    headers = bearer(world.tokens[0])

    bodies = [
        client.post(
            f"{unfold_url(world)}/reveal", json={"through_step": 3}, headers=headers
        ).text,
        client.get(unfold_url(world), headers=headers).text,
        client.get(f"/api/v1/courses/{world.course_id}/history", headers=headers).text,
    ]

    haystack = "\n".join(bodies) + "\n" + caplog.text
    assert "prof@example.edu" not in haystack
    assert world.tokens[0] not in haystack
