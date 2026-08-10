"""Milestone 8.1: the professor's submission review surface.

The read half of 8.1 (grading already landed with 6.2): a professor-and-owner
list of a course's submissions, and a detail that puts the scan beside the
transcription with the region boxes the hover-linking needs. The properties
that matter are the authorization surface (a seat never reaches it, a
non-owner never reaches it) and the no-PII rule: a submission is a seat's, and
a seat number is the only thing about a student that appears anywhere.
"""

import json
import logging
from collections.abc import Iterator
from pathlib import Path
from typing import Any

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
    seed_variant,
)

MB = 1024 * 1024


# The fixtures are declared here rather than imported: importing a fixture and
# then naming a parameter after it shadows the import, which ruff reads as a
# redefinition. The helpers above are plain functions and import cleanly.


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
    """A course with a variant, one or more redeemed seats, and the owning
    professor's headers, which every review test needs."""

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


def build_world(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path, seats: int = 1
) -> World:
    headers = professor(client)
    course_id = make_course(client, headers)
    case_study_id = make_case_study(client, headers, course_id)
    variant_id = seed_variant(tmp_data, course_id, case_study_id)
    tokens = seat_tokens(client, headers, course_id, storage, count=seats)
    return World(headers, course_id, case_study_id, variant_id, tokens)


def submit(client: TestClient, token: str, variant_id: int, pages: int = 1) -> int:
    manifest = [{"content_type": "image/jpeg", "size_bytes": MB} for _ in range(pages)]
    r = request_upload(client, token, variant_id, manifest)
    assert r.status_code == 201, r.text
    return int(r.json()["submission_id"])


def seed_processed(
    tmp_data: Path,
    course_id: int,
    submission_id: int,
    pages: list[tuple[str, list[dict[str, Any]]]],
    *,
    conf: float = 0.85,
) -> None:
    """Mark a submission processed with per-page readings and the preprocessed
    renditions, exactly as the worker leaves it, so the review read has the
    same data in front of it that production would."""
    conn = connect(tmp_data / "courses" / f"{course_id}.db")
    try:
        recognized = "\n\n".join(md for md, _ in pages)
        conn.execute(
            "UPDATE submissions SET status = 'processed', recognition_conf = ?,"
            " recognized_z = ? WHERE id = ?",
            (conf, compress_text(conn, "handwriting", recognized), submission_id),
        )
        for index, (markdown, regions) in enumerate(pages):
            sha = f"sha-{submission_id}-{index}"
            conn.execute(
                "UPDATE submission_pages SET content_sha = ?, quality_status = 'ok',"
                " grayscale_key = ?, binarized_key = ?"
                " WHERE submission_id = ? AND page_index = ?",
                (
                    sha,
                    f"pre/{submission_id}/{index}.grayscale.png",
                    f"pre/{submission_id}/{index}.binarized.png",
                    submission_id,
                    index,
                ),
            )
            conn.execute(
                "INSERT INTO page_transcriptions (content_hash, markdown_z, confidence,"
                " regions_json, model_id, prompt_version, created_at)"
                " VALUES (?, ?, ?, ?, 'm', 'v1', 0)",
                (
                    sha,
                    compress_text(conn, "handwriting", markdown),
                    0.9,
                    json.dumps(regions),
                ),
            )
    finally:
        conn.close()


# ----------------------------------------------------------------------- list


def test_list_shows_seat_numbers_status_and_confidence(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    world = build_world(client, storage, tmp_data, seats=2)
    first = submit(client, world.tokens[0], world.variant_id)
    second = submit(client, world.tokens[1], world.variant_id)
    seed_processed(tmp_data, world.course_id, first, [("Working", [])], conf=0.77)

    r = client.get(
        f"/api/v1/courses/{world.course_id}/submissions", headers=world.headers
    )

    assert r.status_code == 200, r.text
    items = r.json()["submissions"]
    assert [i["id"] for i in items] == [first, second]
    assert items[0]["seat_number"] == "S-001"
    assert items[1]["seat_number"] == "S-002"
    assert items[0]["status"] == "processed"
    assert items[0]["recognition_conf"] == 0.77
    assert items[0]["variant_id"] == world.variant_id
    assert items[0]["case_study_id"] == world.case_study_id
    assert items[0]["case_study_title"] == "NPV"
    assert items[0]["grade"] is None and items[0]["graded_at"] is None
    # Pending work is still in the queue: the professor decides what to look at.
    assert items[1]["status"] == "pending"
    assert items[1]["recognition_conf"] is None


def test_list_paginates_by_cursor(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    world = build_world(client, storage, tmp_data)
    ids = [submit(client, world.tokens[0], world.variant_id) for _ in range(3)]

    first = client.get(
        f"/api/v1/courses/{world.course_id}/submissions?limit=2", headers=world.headers
    ).json()
    assert [i["id"] for i in first["submissions"]] == ids[:2]
    assert first["next_cursor"] == ids[1]

    second = client.get(
        f"/api/v1/courses/{world.course_id}/submissions?limit=2"
        f"&cursor={first['next_cursor']}",
        headers=world.headers,
    ).json()
    assert [i["id"] for i in second["submissions"]] == ids[2:]
    assert second["next_cursor"] is None


def test_list_filters_by_status_and_by_variant(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    world = build_world(client, storage, tmp_data)
    other_variant = seed_variant(tmp_data, world.course_id, world.case_study_id)
    done = submit(client, world.tokens[0], world.variant_id)
    pending = submit(client, world.tokens[0], world.variant_id)
    elsewhere = submit(client, world.tokens[0], other_variant)
    seed_processed(tmp_data, world.course_id, done, [("Working", [])])

    by_status = client.get(
        f"/api/v1/courses/{world.course_id}/submissions?status=processed",
        headers=world.headers,
    ).json()
    assert [i["id"] for i in by_status["submissions"]] == [done]

    by_variant = client.get(
        f"/api/v1/courses/{world.course_id}/submissions?variant_id={other_variant}",
        headers=world.headers,
    ).json()
    assert [i["id"] for i in by_variant["submissions"]] == [elsewhere]
    assert pending not in [i["id"] for i in by_variant["submissions"]]


def test_list_is_empty_for_a_course_with_no_submissions(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    world = build_world(client, storage, tmp_data)

    r = client.get(
        f"/api/v1/courses/{world.course_id}/submissions", headers=world.headers
    )

    assert r.status_code == 200
    assert r.json() == {"submissions": [], "next_cursor": None}


# --------------------------------------------------------------------- detail


def test_detail_puts_the_scan_beside_the_transcription(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    """Stage 5 of the pipeline: the professor reads the scan with the
    transcription beside it, region boxes present so the surface can hover-link
    text to image, and low-confidence spans identifiable."""
    world = build_world(client, storage, tmp_data)
    submission_id = submit(client, world.tokens[0], world.variant_id, pages=2)
    seed_processed(
        tmp_data,
        world.course_id,
        submission_id,
        [
            (
                r"Step one \(x^2\)",
                [{"bbox": [0.1, 0.2, 0.5, 0.1], "confidence": 0.42, "text": "Step one"}],
            ),
            ("Step two", []),
        ],
    )

    r = client.get(
        f"/api/v1/courses/{world.course_id}/submissions/{submission_id}",
        headers=world.headers,
    )

    assert r.status_code == 200, r.text
    body = r.json()
    assert body["id"] == submission_id
    assert body["seat_number"] == "S-001"
    assert body["status"] == "processed"
    assert body["variant_id"] == world.variant_id
    assert "Step one" in body["recognized_markdown"]
    assert [p["page_index"] for p in body["pages"]] == [0, 1]

    page = body["pages"][0]
    assert page["markdown"] == r"Step one \(x^2\)"
    assert page["confidence"] == 0.9
    assert page["quality_status"] == "ok"
    assert page["regions"][0]["bbox"] == [0.1, 0.2, 0.5, 0.1]
    assert page["regions"][0]["confidence"] == 0.42
    # The scan is the source of truth for grading, so the original is served
    # alongside the cleaned rendition the model actually read. Bytes stay in
    # object storage: these are presigned URLs, never a proxy through the API.
    assert page["image_url"].startswith("https://storage.test/")
    assert "grayscale" in (page["grayscale_url"] or "")
    assert "binarized" not in json.dumps(body)


def test_detail_before_processing_reports_status_not_a_404(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    """A submission still in the queue is a legitimate thing to open; it shows
    its state and its pages, with the reading simply empty."""
    world = build_world(client, storage, tmp_data)
    submission_id = submit(client, world.tokens[0], world.variant_id)

    r = client.get(
        f"/api/v1/courses/{world.course_id}/submissions/{submission_id}",
        headers=world.headers,
    )

    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "pending"
    assert body["recognized_markdown"] is None
    assert body["pages"][0]["markdown"] == ""
    assert body["pages"][0]["regions"] == []
    assert body["pages"][0]["grayscale_url"] is None
    assert body["pages"][0]["image_url"].startswith("https://storage.test/")


def test_detail_of_an_unknown_submission_is_a_404(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    world = build_world(client, storage, tmp_data)

    r = client.get(
        f"/api/v1/courses/{world.course_id}/submissions/9999", headers=world.headers
    )
    assert r.status_code == 404


def test_page_read_refreshes_one_page_url(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    """Presigned URLs expire; refreshing one page must not mean refetching the
    whole review."""
    world = build_world(client, storage, tmp_data)
    submission_id = submit(client, world.tokens[0], world.variant_id, pages=2)
    seed_processed(
        tmp_data, world.course_id, submission_id, [("One", []), ("Two", [])]
    )

    r = client.get(
        f"/api/v1/courses/{world.course_id}/submissions/{submission_id}/pages/1",
        headers=world.headers,
    )

    assert r.status_code == 200, r.text
    body = r.json()
    assert body["page_index"] == 1
    assert body["image_url"].startswith("https://storage.test/")
    assert body["grayscale_url"] is not None

    missing = client.get(
        f"/api/v1/courses/{world.course_id}/submissions/{submission_id}/pages/7",
        headers=world.headers,
    )
    assert missing.status_code == 404


# ---------------------------------------------------------------------- grade


def test_the_list_reflects_a_grade_once_given(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    """The review queue has to show what is already done, so the grade written
    by the 6.2 action reads back here."""
    world = build_world(client, storage, tmp_data)
    submission_id = submit(client, world.tokens[0], world.variant_id)
    seed_processed(tmp_data, world.course_id, submission_id, [("Working", [])])

    graded = client.post(
        f"/api/v1/courses/{world.course_id}/submissions/{submission_id}/grade",
        json={"score": 0.8},
        headers=world.headers,
    )
    assert graded.status_code == 200, graded.text

    items = client.get(
        f"/api/v1/courses/{world.course_id}/submissions", headers=world.headers
    ).json()["submissions"]
    assert items[0]["grade"] == 0.8
    assert items[0]["graded_at"] is not None

    detail = client.get(
        f"/api/v1/courses/{world.course_id}/submissions/{submission_id}",
        headers=world.headers,
    ).json()
    assert detail["grade"] == 0.8


# -------------------------------------------------------------- authorization


def test_the_review_surface_is_professor_and_owner_only(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    world = build_world(client, storage, tmp_data)
    submission_id = submit(client, world.tokens[0], world.variant_id)
    stranger = professor(client, email="other@example.edu")
    paths = [
        f"/api/v1/courses/{world.course_id}/submissions",
        f"/api/v1/courses/{world.course_id}/submissions/{submission_id}",
        f"/api/v1/courses/{world.course_id}/submissions/{submission_id}/pages/0",
    ]

    for path in paths:
        assert client.get(path).status_code == 401, path
        assert client.get(path, headers=stranger).status_code == 403, path
        # A seat never reads the review surface, not even its own submission:
        # its own reads live on the seat endpoints.
        assert client.get(
            path, headers=bearer(world.tokens[0])
        ).status_code in (401, 403), path


def test_the_course_in_the_path_is_the_scope(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    """Per-shard ids collide across courses, which is exactly why the course
    scopes the read (decision 0013). A busy course's submission id must not
    resolve against an empty sibling course owned by the same professor."""
    busy = build_world(client, storage, tmp_data)
    foreign = submit(client, busy.tokens[0], busy.variant_id)

    # A second course, same owner, with no submissions of its own.
    quiet_course = make_course(client, busy.headers)

    listed = client.get(
        f"/api/v1/courses/{quiet_course}/submissions", headers=busy.headers
    ).json()["submissions"]
    assert listed == []

    r = client.get(
        f"/api/v1/courses/{quiet_course}/submissions/{foreign}", headers=busy.headers
    )
    assert r.status_code == 404

    # And the same id does resolve in the course that owns it.
    assert (
        client.get(
            f"/api/v1/courses/{busy.course_id}/submissions/{foreign}",
            headers=busy.headers,
        ).status_code
        == 200
    )


# --------------------------------------------------------------------- no PII


def test_the_review_surface_names_a_seat_and_nothing_else(
    client: TestClient,
    storage: FakeObjectStorage,
    tmp_data: Path,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """The standing rule, extended to 8.1: across a full list-and-read cycle,
    nothing about a student beyond the seat number reaches a response body or
    a log line. The professor's own email is the control: it is an account
    identity, and it must not travel on a student-scoped record either."""
    caplog.set_level(logging.DEBUG)
    world = build_world(client, storage, tmp_data)
    submission_id = submit(client, world.tokens[0], world.variant_id)
    seed_processed(tmp_data, world.course_id, submission_id, [("Working", [])])

    bodies = [
        client.get(
            f"/api/v1/courses/{world.course_id}/submissions", headers=world.headers
        ).text,
        client.get(
            f"/api/v1/courses/{world.course_id}/submissions/{submission_id}",
            headers=world.headers,
        ).text,
        client.get(
            f"/api/v1/courses/{world.course_id}/submissions/{submission_id}/pages/0",
            headers=world.headers,
        ).text,
    ]

    haystack = "\n".join(bodies) + "\n" + caplog.text
    assert "prof@example.edu" not in haystack
    # The seat token is a credential and never echoed back.
    assert world.tokens[0] not in haystack
    # The seat number is the one identifier the surface carries.
    assert "S-001" in bodies[0]
