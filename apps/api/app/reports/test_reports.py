"""Milestone 8.3: course reporting and the two product-health dashboards.

Four professor-and-owner reads over data the pipelines already write: activity
by seat number, token and speech usage per course, the two product-health
metrics (recognition confidence distribution, variant verification pass rate),
and the mastery spec's calibration loop (defence rubric against professor
grade). Nothing here computes new evidence; these are lenses on existing rows,
so the properties worth pinning are the arithmetic, the honest nulls where
there is nothing to divide by, and the usual authorization and no-PII surface.
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


def build_world(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path, seats: int = 1
) -> World:
    headers = professor(client)
    course_id = make_course(client, headers)
    case_study_id = make_case_study(client, headers, course_id)
    variant_id = seed_variant(tmp_data, course_id, case_study_id)
    tokens = seat_tokens(client, headers, course_id, storage, count=seats)
    return World(headers, course_id, case_study_id, variant_id, tokens)


def submit(client: TestClient, token: str, variant_id: int) -> int:
    r = request_upload(
        client, token, variant_id, [{"content_type": "image/jpeg", "size_bytes": MB}]
    )
    assert r.status_code == 201, r.text
    return int(r.json()["submission_id"])


def shard(tmp_data: Path, course_id: int) -> sqlite3.Connection:
    return connect(tmp_data / "courses" / f"{course_id}.db")


def seed_page_confidence(
    tmp_data: Path,
    course_id: int,
    submission_id: int,
    confidences: list[float | None],
    *,
    rejected: int = 0,
) -> None:
    """Give a submission's pages cached readings at known confidences, the way
    the worker leaves them, so the distribution has something to bucket."""
    conn = shard(tmp_data, course_id)
    try:
        for index, confidence in enumerate(confidences):
            sha = f"sha-{submission_id}-{index}"
            conn.execute(
                "UPDATE submission_pages SET content_sha = ?, quality_status = 'ok'"
                " WHERE submission_id = ? AND page_index = ?",
                (sha, submission_id, index),
            )
            if confidence is None:
                continue
            conn.execute(
                "INSERT INTO page_transcriptions (content_hash, markdown_z, confidence,"
                " regions_json, model_id, prompt_version, created_at)"
                " VALUES (?, ?, ?, '[]', 'm', 'v1', 0)",
                (sha, compress_text(conn, "handwriting", "working"), confidence),
            )
        for _ in range(rejected):
            conn.execute(
                "UPDATE submission_pages SET quality_status = 'rejected',"
                " reject_reason = 'blurry' WHERE submission_id = ? AND page_index = 0",
                (submission_id,),
            )
        conn.commit()
    finally:
        conn.close()


def seed_variants(
    tmp_data: Path, course_id: int, case_study_id: int, states: list[str]
) -> None:
    conn = shard(tmp_data, course_id)
    try:
        for state in states:
            conn.execute(
                "INSERT INTO variants (case_study_id, seed_json_z, body_z, solution_z,"
                " verification, model_id, created_at)"
                " VALUES (?, ?, ?, ?, ?, 'test-model', 1750000000)",
                (
                    case_study_id,
                    compress_text(conn, "problem_text", "{}"),
                    compress_text(conn, "problem_text", "body"),
                    compress_text(conn, "problem_text", "solution"),
                    state,
                ),
            )
        conn.commit()
    finally:
        conn.close()


def seed_usage(
    tmp_data: Path,
    course_id: int,
    tokens: list[tuple[str, str, int, int, int]],
    speech: list[tuple[str, str, str, float, int]] | None = None,
) -> None:
    conn = shard(tmp_data, course_id)
    try:
        conn.executemany(
            "INSERT INTO token_usage (kind, model_id, input_tokens, output_tokens,"
            " created_at) VALUES (?, ?, ?, ?, ?)",
            tokens,
        )
        if speech:
            conn.executemany(
                "INSERT INTO speech_usage (kind, provider, unit, amount, created_at)"
                " VALUES (?, ?, ?, ?, ?)",
                speech,
            )
        conn.commit()
    finally:
        conn.close()


def seed_defence(
    tmp_data: Path,
    course_id: int,
    submission_id: int,
    seat_id: int,
    reasonings: list[int],
    *,
    status: str = "closed",
    validated: bool = True,
) -> None:
    """A closed conversation with a validated verdict, as `close` writes it."""
    rubric = {
        "concepts": [
            {"concept_id": index + 1, "reasoning": r, "gap": f"gap {index}"}
            for index, r in enumerate(reasonings)
        ],
        "concept_to_revisit": 1,
        "session_confidence": 0.9,
    }
    conn = shard(tmp_data, course_id)
    try:
        conn.execute(
            "INSERT INTO conversations (submission_id, seat_id, status, rubric_json,"
            " concept_to_revisit, turn_count, started_at, closed_at)"
            " VALUES (?, ?, ?, ?, 1, 6, 1750000000, 1750000600)",
            (
                submission_id,
                seat_id,
                status,
                json.dumps(rubric) if validated else None,
            ),
        )
        conn.commit()
    finally:
        conn.close()


def seat_id_of(tmp_data: Path, course_id: int, seat_number: str) -> int:
    conn = connect(tmp_data / "directory.db")
    try:
        row = conn.execute(
            "SELECT id FROM seats WHERE course_id = ? AND seat_number = ?",
            (course_id, seat_number),
        ).fetchone()
        assert row is not None
        return int(row[0])
    finally:
        conn.close()


def grade(client: TestClient, world: World, submission_id: int, score: float) -> None:
    r = client.post(
        f"/api/v1/courses/{world.course_id}/submissions/{submission_id}/grade",
        json={"score": score},
        headers=world.headers,
    )
    assert r.status_code == 200, r.text


# ------------------------------------------------------------------- activity


def test_activity_reports_every_seat_by_number(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    world = build_world(client, storage, tmp_data, seats=3)
    first = submit(client, world.tokens[0], world.variant_id)
    submit(client, world.tokens[0], world.variant_id)
    second = submit(client, world.tokens[1], world.variant_id)
    grade(client, world, first, 0.9)
    seed_defence(
        tmp_data,
        world.course_id,
        second,
        seat_id_of(tmp_data, world.course_id, "S-002"),
        [3],
    )

    r = client.get(
        f"/api/v1/courses/{world.course_id}/reports/activity", headers=world.headers
    )

    assert r.status_code == 200, r.text
    seats = r.json()["seats"]
    assert [s["seat_number"] for s in seats] == ["S-001", "S-002", "S-003"]
    assert seats[0]["submissions"] == 2
    assert seats[0]["graded"] == 1
    assert seats[0]["defences"] == 0
    assert seats[1]["submissions"] == 1
    assert seats[1]["defences"] == 1
    # A seat that has done nothing is still listed, at zero: the professor is
    # looking for exactly that.
    assert seats[2]["submissions"] == 0
    assert seats[2]["last_submitted_at"] is None
    assert seats[0]["last_submitted_at"] is not None


def test_activity_totals_the_course(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    world = build_world(client, storage, tmp_data, seats=2)
    submit(client, world.tokens[0], world.variant_id)
    submit(client, world.tokens[1], world.variant_id)

    body = client.get(
        f"/api/v1/courses/{world.course_id}/reports/activity", headers=world.headers
    ).json()

    assert body["seat_count"] == 2
    assert body["active_seats"] == 2
    assert body["total_submissions"] == 2


# ---------------------------------------------------------------------- usage


def test_usage_totals_tokens_and_speech_by_kind_and_model(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    world = build_world(client, storage, tmp_data)
    seed_usage(
        tmp_data,
        world.course_id,
        tokens=[
            ("variant_generation", "model-a", 1000, 200, 1750000000),
            ("variant_generation", "model-a", 500, 100, 1750000100),
            ("variant_verification", "model-b", 300, 50, 1750000200),
        ],
        speech=[
            ("defense_stt", "deepgram", "seconds", 120.0, 1750000300),
            ("defense_tts", "cartesia", "characters", 4000.0, 1750000400),
        ],
    )

    body = client.get(
        f"/api/v1/courses/{world.course_id}/reports/usage", headers=world.headers
    ).json()

    assert body["total_input_tokens"] == 1800
    assert body["total_output_tokens"] == 350
    by_kind = {row["kind"]: row for row in body["tokens"]}
    assert by_kind["variant_generation"]["model_id"] == "model-a"
    assert by_kind["variant_generation"]["input_tokens"] == 1500
    assert by_kind["variant_generation"]["output_tokens"] == 300
    assert by_kind["variant_generation"]["calls"] == 2
    assert by_kind["variant_verification"]["input_tokens"] == 300
    speech = {row["kind"]: row for row in body["speech"]}
    assert speech["defense_stt"]["amount"] == 120.0
    assert speech["defense_stt"]["unit"] == "seconds"
    assert speech["defense_tts"]["amount"] == 4000.0


def test_usage_reports_no_cost_when_no_rates_are_configured(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    """The guides name no prices, and inventing one would be worse than
    reporting none: usage is always real, cost appears only when the operator
    has configured rates."""
    world = build_world(client, storage, tmp_data)
    seed_usage(
        tmp_data,
        world.course_id,
        tokens=[("variant_generation", "model-a", 1_000_000, 1_000_000, 1750000000)],
    )

    body = client.get(
        f"/api/v1/courses/{world.course_id}/reports/usage", headers=world.headers
    ).json()

    assert body["priced"] is False
    assert body["total_cost"] is None
    assert body["tokens"][0]["cost"] is None


def test_usage_prices_when_rates_are_configured(
    client: TestClient,
    storage: FakeObjectStorage,
    tmp_data: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    world = build_world(client, storage, tmp_data)
    seed_usage(
        tmp_data,
        world.course_id,
        tokens=[("variant_generation", "model-a", 1_000_000, 500_000, 1750000000)],
        speech=[("defense_tts", "cartesia", "characters", 10_000.0, 1750000000)],
    )
    # Rates are per million tokens and per speech unit, the shapes providers
    # publish.
    monkeypatch.setenv(
        "TIRO_MODEL_PRICES",
        json.dumps({"model-a": {"input_per_mtok": 3.0, "output_per_mtok": 15.0}}),
    )
    monkeypatch.setenv(
        "TIRO_SPEECH_PRICES", json.dumps({"defense_tts": 0.00002})
    )

    body = client.get(
        f"/api/v1/courses/{world.course_id}/reports/usage", headers=world.headers
    ).json()

    assert body["priced"] is True
    # 1.0 Mtok in at 3.00 plus 0.5 Mtok out at 15.00 = 10.50
    assert body["tokens"][0]["cost"] == pytest.approx(10.50)
    assert body["speech"][0]["cost"] == pytest.approx(0.20)
    assert body["total_cost"] == pytest.approx(10.70)


def test_usage_respects_the_window(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    world = build_world(client, storage, tmp_data)
    seed_usage(
        tmp_data,
        world.course_id,
        tokens=[
            ("variant_generation", "model-a", 100, 10, 1_000_000),
            ("variant_generation", "model-a", 700, 70, 2_000_000),
        ],
    )

    body = client.get(
        f"/api/v1/courses/{world.course_id}/reports/usage?since=1500000",
        headers=world.headers,
    ).json()

    assert body["total_input_tokens"] == 700


# --------------------------------------------------------------------- health


def test_health_buckets_the_recognition_confidence_distribution(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    """The first product-health metric (backend guide 8): how confident the
    reader is across this course's pages, as a distribution rather than a
    single mean, because the tail is the interesting part."""
    world = build_world(client, storage, tmp_data)
    one = submit(client, world.tokens[0], world.variant_id)
    seed_page_confidence(tmp_data, world.course_id, one, [0.95])
    two = submit(client, world.tokens[0], world.variant_id)
    seed_page_confidence(tmp_data, world.course_id, two, [0.32])
    three = submit(client, world.tokens[0], world.variant_id)
    seed_page_confidence(tmp_data, world.course_id, three, [0.91])

    health = client.get(
        f"/api/v1/courses/{world.course_id}/reports/health", headers=world.headers
    ).json()["recognition"]

    assert health["pages_read"] == 3
    assert health["mean_confidence"] == pytest.approx((0.95 + 0.32 + 0.91) / 3)
    buckets = {b["lower"]: b["count"] for b in health["buckets"]}
    assert len(health["buckets"]) == 10
    assert buckets[0.9] == 2
    assert buckets[0.3] == 1
    assert buckets[0.5] == 0


def test_health_reports_an_empty_distribution_honestly(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    world = build_world(client, storage, tmp_data)

    health = client.get(
        f"/api/v1/courses/{world.course_id}/reports/health", headers=world.headers
    ).json()["recognition"]

    assert health["pages_read"] == 0
    assert health["mean_confidence"] is None
    assert sum(b["count"] for b in health["buckets"]) == 0


def test_health_reports_the_verification_pass_rate(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    """The second product-health metric: what share of generated variants the
    independent re-solve agreed with. Manual variants are the professor's own
    call and count in neither half of the rate."""
    world = build_world(client, storage, tmp_data)
    # build_world already seeded one verified variant.
    seed_variants(
        tmp_data,
        world.course_id,
        world.case_study_id,
        ["verified", "verified", "flagged", "manual"],
    )

    verification = client.get(
        f"/api/v1/courses/{world.course_id}/reports/health", headers=world.headers
    ).json()["verification"]

    assert verification["verified"] == 3
    assert verification["flagged"] == 1
    assert verification["manual"] == 1
    assert verification["pass_rate"] == pytest.approx(0.75)


def test_health_pass_rate_is_null_without_generated_variants(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    """No division by zero, and no misleading 0%: nothing has been verified."""
    headers = professor(client)
    course_id = make_course(client, headers)

    verification = client.get(
        f"/api/v1/courses/{course_id}/reports/health", headers=headers
    ).json()["verification"]

    assert verification["verified"] == 0
    assert verification["flagged"] == 0
    assert verification["pass_rate"] is None


# ----------------------------------------------------------- rubric agreement


def test_rubric_agreement_compares_defences_against_grades(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    """The mastery spec's calibration loop (section 10): the tutor's verdict
    tracked against the professor's judgment on the same submission, so a
    rubric drifting toward generosity is visible rather than assumed away."""
    world = build_world(client, storage, tmp_data)
    seat = seat_id_of(tmp_data, world.course_id, "S-001")

    # Rubric 3/3 = 1.0 against a grade of 0.9: the tutor is 0.1 generous.
    lenient = submit(client, world.tokens[0], world.variant_id)
    seed_defence(tmp_data, world.course_id, lenient, seat, [3, 3])
    grade(client, world, lenient, 0.9)

    # Rubric 1.5/3 = 0.5 against a grade of 0.7: the tutor is 0.2 harsh.
    harsh = submit(client, world.tokens[0], world.variant_id)
    seed_defence(tmp_data, world.course_id, harsh, seat, [1, 2])
    grade(client, world, harsh, 0.7)

    body = client.get(
        f"/api/v1/courses/{world.course_id}/reports/rubric-agreement",
        headers=world.headers,
    ).json()

    assert body["pairs"] == 2
    assert body["mean_rubric_score"] == pytest.approx(0.75)
    assert body["mean_grade"] == pytest.approx(0.8)
    # Signed: positive means the rubric reads more generously than the grade.
    assert body["mean_signed_difference"] == pytest.approx(-0.05)
    assert body["mean_absolute_difference"] == pytest.approx(0.15)


def test_rubric_agreement_needs_both_halves(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    world = build_world(client, storage, tmp_data)
    seat = seat_id_of(tmp_data, world.course_id, "S-001")

    graded_only = submit(client, world.tokens[0], world.variant_id)
    grade(client, world, graded_only, 0.8)

    defended_only = submit(client, world.tokens[0], world.variant_id)
    seed_defence(tmp_data, world.course_id, defended_only, seat, [2])

    # A defence whose verdict never validated carries no rubric to compare.
    unvalidated = submit(client, world.tokens[0], world.variant_id)
    seed_defence(
        tmp_data, world.course_id, unvalidated, seat, [2], validated=False
    )
    grade(client, world, unvalidated, 0.5)

    body = client.get(
        f"/api/v1/courses/{world.course_id}/reports/rubric-agreement",
        headers=world.headers,
    ).json()

    assert body["pairs"] == 0
    assert body["mean_rubric_score"] is None
    assert body["correlation"] is None


def test_rubric_agreement_correlates_only_with_enough_pairs(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    world = build_world(client, storage, tmp_data)
    seat = seat_id_of(tmp_data, world.course_id, "S-001")
    only = submit(client, world.tokens[0], world.variant_id)
    seed_defence(tmp_data, world.course_id, only, seat, [3])
    grade(client, world, only, 0.9)

    body = client.get(
        f"/api/v1/courses/{world.course_id}/reports/rubric-agreement",
        headers=world.headers,
    ).json()

    assert body["pairs"] == 1
    assert body["mean_rubric_score"] == pytest.approx(1.0)
    # One point has no correlation, and reporting 1.0 would be a lie.
    assert body["correlation"] is None


def test_rubric_agreement_correlation_is_pearson(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    world = build_world(client, storage, tmp_data)
    seat = seat_id_of(tmp_data, world.course_id, "S-001")
    # Rubric scores 1/3, 2/3, 3/3 against grades that rise with them: perfect
    # positive correlation.
    for reasoning, score in ((1, 0.3), (2, 0.6), (3, 0.9)):
        submission_id = submit(client, world.tokens[0], world.variant_id)
        seed_defence(tmp_data, world.course_id, submission_id, seat, [reasoning])
        grade(client, world, submission_id, score)

    body = client.get(
        f"/api/v1/courses/{world.course_id}/reports/rubric-agreement",
        headers=world.headers,
    ).json()

    assert body["pairs"] == 3
    assert body["correlation"] == pytest.approx(1.0)


# -------------------------------------------------------------- authorization


def test_the_reports_are_professor_and_owner_only(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    world = build_world(client, storage, tmp_data)
    stranger = professor(client, email="other@example.edu")
    paths = [
        f"/api/v1/courses/{world.course_id}/reports/activity",
        f"/api/v1/courses/{world.course_id}/reports/usage",
        f"/api/v1/courses/{world.course_id}/reports/health",
        f"/api/v1/courses/{world.course_id}/reports/rubric-agreement",
    ]

    for path in paths:
        assert client.get(path).status_code == 401, path
        assert client.get(path, headers=stranger).status_code == 403, path
        assert client.get(
            path, headers=bearer(world.tokens[0])
        ).status_code in (401, 403), path


# --------------------------------------------------------------------- no PII


def test_the_reports_name_seats_and_nothing_else(
    client: TestClient,
    storage: FakeObjectStorage,
    tmp_data: Path,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Reporting is where an aggregate quietly grows a name column, so the
    standing rule is asserted here too: seat numbers, never anything else."""
    caplog.set_level(logging.DEBUG)
    world = build_world(client, storage, tmp_data)
    submission_id = submit(client, world.tokens[0], world.variant_id)
    grade(client, world, submission_id, 0.7)

    bodies = [
        client.get(
            f"/api/v1/courses/{world.course_id}/reports/{name}", headers=world.headers
        ).text
        for name in ("activity", "usage", "health", "rubric-agreement")
    ]

    haystack = "\n".join(bodies) + "\n" + caplog.text
    assert "prof@example.edu" not in haystack
    assert world.tokens[0] not in haystack
    assert "S-001" in bodies[0]
