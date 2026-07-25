"""The Phase 6 gate's end-to-end trajectory: seven daily correct submissions
driven through the real pipeline (fixture scans, recorded model responses for
transcription and assessment), evidence emitted after each, and the day-6
label is solid, read through the real seat-facing API with its evidence
trail. The whole stack in one line of causality: pixels to transcription to
comparer to evidence to label."""

import hashlib
import json
import sqlite3
import time
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.compression import compress_text
from app.db.shards import ShardManager
from app.main import create_app
from app.mastery.emission import emit_submission_evidence
from app.mastery.model import RecordedWorkingAssessor, WorkingAssessment, assessment_document
from app.storage import SCANS_BUCKET, get_object_storage
from app.transcription.model import PageTranscription, RecordedTranscriber, Region
from app.transcription.pipeline import STATUS_PROCESSED, run_submission_pipeline
from app.transcription.test_pipeline import FakeStorage, RecordingBus, fake_preprocess_ok

SECRET = "test-secret-not-for-production-0123"
PASSWORD = "a sensible passphrase"
DAY = 86_400

SOLUTION_BLOB = json.dumps(
    {"solution_md": "By Ohm's law, I = V/R.", "final_answers": ["2.553 mA"]}
)


@pytest.fixture()
def storage() -> FakeStorage:
    return FakeStorage()


@pytest.fixture()
def client(tmp_path: Path, storage: FakeStorage) -> Iterator[TestClient]:
    app = create_app(data_dir=tmp_path, jwt_secret=SECRET)
    app.dependency_overrides[get_object_storage] = lambda: storage
    with TestClient(app) as c:
        yield c


def professor(client: TestClient) -> dict[str, str]:
    r = client.post(
        "/api/v1/auth/signup", json={"email": "prof@example.edu", "password": PASSWORD}
    )
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def seat_headers(
    client: TestClient, headers: dict[str, str], course_id: int, storage: FakeStorage
) -> tuple[dict[str, str], int]:
    r = client.post(
        f"/api/v1/courses/{course_id}/seats", json={"count": 1}, headers=headers
    )
    assert r.status_code == 201, r.text
    csv_bytes = next(
        data for (_, key), data in storage.objects.items() if key.endswith(".csv")
    )
    code = csv_bytes.decode().strip().splitlines()[1].split(",")[1]
    redeemed = client.post("/api/v1/seats/redeem", json={"code": code}).json()
    return (
        {"Authorization": f"Bearer {redeemed['token']}"},
        int(redeemed["seat"]["seat_id"]) if "seat" in redeemed else 1,
    )


def transcription_for(day: int) -> str:
    return f"Day {day} working: I = V/R = 12/4700.\n\nSo I = 2.553 mA."


async def test_seven_daily_correct_submissions_reach_solid_on_day_six(
    client: TestClient, tmp_path: Path, storage: FakeStorage
) -> None:
    headers = professor(client)
    r = client.post("/api/v1/courses", json={"title": "EE 201"}, headers=headers)
    course_id = int(r.json()["id"])
    concept = client.post(
        f"/api/v1/courses/{course_id}/concepts",
        json={"name": "Ohm's law", "description": "V = IR"},
        headers=headers,
    )
    assert concept.status_code == 201, concept.text
    concept_id = int(concept.json()["id"])
    case = client.post(
        f"/api/v1/courses/{course_id}/case-studies",
        json={"title": "The circuit", "body": "Find the current."},
        headers=headers,
    )
    case_study_id = int(case.json()["id"])
    mapped = client.put(
        f"/api/v1/courses/{course_id}/case-studies/{case_study_id}/concepts",
        json={"mappings": [{"concept_id": concept_id, "weight": 1.0}]},
        headers=headers,
    )
    assert mapped.status_code == 200, mapped.text
    seat, _ = seat_headers(client, headers, course_id, storage)

    base = int(time.time()) - 6 * DAY
    bus = RecordingBus()

    async with ShardManager(tmp_path) as shards:

        def make_variant(conn: sqlite3.Connection) -> int:
            cursor = conn.execute(
                "INSERT INTO variants (case_study_id, seed_json_z, body_z,"
                " solution_z, verification, model_id, created_at)"
                " VALUES (?, ?, ?, ?, 'verified', 'm', 0)",
                (
                    case_study_id,
                    compress_text(conn, "problem_text", "{}"),
                    compress_text(conn, "problem_text", "Find the current."),
                    compress_text(conn, "problem_text", SOLUTION_BLOB),
                ),
            )
            return int(cursor.lastrowid or 0)

        variant_id = await shards.course(course_id).run(make_variant)

        for day in range(7):
            at = base + day * DAY
            page = f"scan-day-{day}".encode()
            prefix = f"scans/{course_id}/day{day}"

            def seed(conn: sqlite3.Connection, d: int = day, p: str = prefix) -> int:
                cursor = conn.execute(
                    "INSERT INTO submissions (variant_id, seat_id, page_count,"
                    " storage_prefix, status, submitted_at)"
                    " VALUES (?, 1, 1, ?, 'uploaded', ?)",
                    (variant_id, p, base + d * DAY),
                )
                submission_id = int(cursor.lastrowid or 0)
                conn.execute(
                    "INSERT INTO submission_pages (submission_id, page_index,"
                    " storage_key, content_type, size_bytes)"
                    " VALUES (?, 0, ?, 'image/jpeg', 1)",
                    (submission_id, f"{p}/0"),
                )
                return submission_id

            submission_id = await shards.course(course_id).run(seed)
            storage.objects[(SCANS_BUCKET, f"{prefix}/0")] = page

            text = transcription_for(day)
            transcriber = RecordedTranscriber(
                {
                    hashlib.sha256(b"gray:" + page).hexdigest(): PageTranscription(
                        markdown=text,
                        confidence=0.95,
                        regions=[
                            Region(
                                bbox=(0, 0.8, 1, 0.2),
                                confidence=0.95,
                                text="I = 2.553 mA",
                            )
                        ],
                    )
                }
            )
            status = await run_submission_pipeline(
                shards=shards,
                storage=storage,
                transcriber=transcriber,
                bus=bus,
                course_id=course_id,
                submission_id=submission_id,
                preprocess=fake_preprocess_ok,
            )
            assert status == STATUS_PROCESSED

            assessor = RecordedWorkingAssessor({})
            assessor.record(
                assessment_document(
                    text, "By Ohm's law, I = V/R.", [(concept_id, "Ohm's law", "V = IR")]
                ),
                WorkingAssessment.model_validate(
                    {
                        "concepts": [{"concept_id": concept_id, "rubric": 3}],
                        "confidence": 0.95,
                    }
                ),
            )
            counts = await emit_submission_evidence(
                shards=shards,
                storage=storage,
                assessor=assessor,
                course_id=course_id,
                submission_id=submission_id,
                at=at,
            )
            assert counts["answer_match"] == 1

            if day == 2:
                early = client.get(
                    f"/api/v1/courses/{course_id}/mastery", headers=seat
                ).json()
                assert early["concepts"][0]["label"] != "solid"  # not yet earned

    picture = client.get(f"/api/v1/courses/{course_id}/mastery", headers=seat)
    assert picture.status_code == 200, picture.text
    concept_view = picture.json()["concepts"][0]
    assert concept_view["concept_id"] == concept_id
    assert concept_view["label"] == "solid"  # the day-6 gate
    # The transparency contract: the label arrives with its evidence trail.
    assert len(concept_view["trail"]) >= 1
    assert all(line["text"] for line in concept_view["trail"])
