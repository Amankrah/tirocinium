"""Milestone 5.4: the variant pool. Publish pre-generates, the fill job tops
up to the target under the token budget, and the practice read serves a
verified variant instantly, from what exists, always: the phase gate's pool
invariant is asserted under repeated load with an empty generation budget."""

import io
import json
import time
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.compression import compress_text
from app.db import ShardManager
from app.db.connection import connect
from app.main import create_app
from app.storage import get_object_storage
from app.tasks import get_task_queue
from app.variants.model import GeneratedVariant, ReSolveResult
from app.variants.pool import fill_pool
from app.variants.routes import PracticeVariantOut

SECRET = "test-secret-not-for-production-0123"
PASSWORD = "a sensible passphrase"

BODY = "Compute the NPV at a discount rate of 0.08."
SPEC_JSON = json.dumps(
    {
        "parameters": {
            "rate": {"type": "number", "base": 0.08, "range": [0.04, 0.12]}
        },
        "invariants": [],
        "solution_method": None,
    }
)


class FakeStorage:
    def __init__(self) -> None:
        self.objects: dict[tuple[str, str], bytes] = {}

    def create_bucket(self, *, Bucket: str) -> object:
        return {}

    def put_object(self, *, Bucket: str, Key: str, Body: Any) -> object:
        self.objects[(Bucket, Key)] = (
            Body.read() if hasattr(Body, "read") else bytes(Body)
        )
        return {}

    def get_object(self, *, Bucket: str, Key: str) -> Any:
        return {"Body": io.BytesIO(self.objects[(Bucket, Key)])}

    def generate_presigned_url(
        self, ClientMethod: str, Params: dict[str, str], ExpiresIn: int
    ) -> str:
        return f"https://storage.test/{Params['Key']}"


class RecordingQueue:
    def __init__(self) -> None:
        self.generated: list[tuple[int, int, int]] = []
        self.fills: list[tuple[int, int]] = []

    async def enqueue_process_submission(
        self, course_id: int, submission_id: int
    ) -> None:
        return None

    async def enqueue_process_import(self, course_id: int, import_id: int) -> None:
        return None

    async def enqueue_generate_variant(
        self, course_id: int, case_study_id: int, seed: int
    ) -> None:
        self.generated.append((course_id, case_study_id, seed))

    async def enqueue_fill_pool(self, course_id: int, case_study_id: int) -> None:
        self.fills.append((course_id, case_study_id))


class AgreeingGenerator:
    """A protocol fake for pool tests, where seeds are random so replay-by-
    document cannot key responses. Never a live model: it fabricates an
    agreeing (or disagreeing) pair locally, with token counts for the
    accounting."""

    def __init__(self, answers: list[str] | None = None) -> None:
        self.calls = 0
        self._answers = answers if answers is not None else ["42.00 EUR"]

    async def generate(
        self, document: str, prompt: str, *, model_id: str
    ) -> GeneratedVariant:
        self.calls += 1
        return GeneratedVariant(
            body_md=f"Variant {self.calls} of the problem.",
            solution_md="Worked solution.",
            final_answers=list(self._answers),
            input_tokens=100,
            output_tokens=50,
        )


class AgreeingVerifier:
    def __init__(self, answers: list[str] | None = None) -> None:
        self.calls = 0
        self._answers = answers if answers is not None else ["42.00 EUR"]

    async def resolve(
        self, document: str, images: list[bytes], prompt: str, *, model_id: str
    ) -> ReSolveResult:
        self.calls += 1
        return ReSolveResult(
            solution_md="Independent working.",
            final_answers=list(self._answers),
            input_tokens=80,
            output_tokens=40,
        )


@pytest.fixture()
def storage() -> FakeStorage:
    return FakeStorage()


@pytest.fixture()
def queue() -> RecordingQueue:
    return RecordingQueue()


@pytest.fixture()
def client(
    tmp_path: Path, storage: FakeStorage, queue: RecordingQueue
) -> Iterator[TestClient]:
    app = create_app(data_dir=tmp_path, jwt_secret=SECRET)
    app.dependency_overrides[get_object_storage] = lambda: storage
    app.dependency_overrides[get_task_queue] = lambda: queue
    with TestClient(app) as c:
        yield c


def professor(client: TestClient) -> dict[str, str]:
    r = client.post(
        "/api/v1/auth/signup", json={"email": "prof@example.edu", "password": PASSWORD}
    )
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def seat(
    client: TestClient, headers: dict[str, str], course_id: int, storage: FakeStorage
) -> dict[str, str]:
    r = client.post(
        f"/api/v1/courses/{course_id}/seats", json={"count": 1}, headers=headers
    )
    assert r.status_code == 201, r.text
    csv_bytes = next(
        data for (_, key), data in storage.objects.items() if key.endswith(".csv")
    )
    code = csv_bytes.decode().strip().splitlines()[1].split(",")[1]
    redeemed = client.post("/api/v1/seats/redeem", json={"code": code})
    return {"Authorization": f"Bearer {redeemed.json()['token']}"}


def make_case_study(
    client: TestClient,
    headers: dict[str, str],
    tmp_path: Path,
    *,
    with_spec: bool = True,
    publish: bool = False,
) -> tuple[int, int]:
    r = client.post("/api/v1/courses", json={"title": "FDSC 315"}, headers=headers)
    course_id = int(r.json()["id"])
    r = client.post(
        f"/api/v1/courses/{course_id}/case-studies",
        json={"title": "NPV", "body": BODY},
        headers=headers,
    )
    case_study_id = int(r.json()["id"])
    if with_spec:
        conn = connect(tmp_path / "courses" / f"{course_id}.db")
        try:
            conn.execute(
                "UPDATE case_studies SET param_spec_z = ? WHERE id = ?",
                (compress_text(conn, "problem_text", SPEC_JSON), case_study_id),
            )
        finally:
            conn.close()
    if publish:
        r = client.post(
            f"/api/v1/courses/{course_id}/case-studies/{case_study_id}/publish",
            headers=headers,
        )
        assert r.status_code == 200, r.text
    return course_id, case_study_id


def seed_variant(
    tmp_path: Path,
    course_id: int,
    case_study_id: int,
    *,
    seed: int,
    verification: str = "verified",
) -> int:
    conn = connect(tmp_path / "courses" / f"{course_id}.db")
    try:
        solution = json.dumps(
            {"solution_md": "Worked.", "final_answers": ["42.00 EUR"]}
        )
        cursor = conn.execute(
            "INSERT INTO variants (case_study_id, seed, seed_json_z, body_z,"
            " solution_z, verification, model_id, created_at)"
            " VALUES (?, ?, ?, ?, ?, ?, 'm', 0)",
            (
                case_study_id,
                seed,
                compress_text(conn, "problem_text", json.dumps({"rate": 0.06})),
                compress_text(conn, "problem_text", f"Pool variant {seed}."),
                compress_text(conn, "problem_text", solution),
                verification,
            ),
        )
        return int(cursor.lastrowid or 0)
    finally:
        conn.close()


async def run_fill(
    tmp_path: Path,
    storage: FakeStorage,
    course_id: int,
    case_study_id: int,
    *,
    generator: AgreeingGenerator,
    verifier: AgreeingVerifier,
    target: int,
    budget: int | None = None,
) -> dict[str, int]:
    async with ShardManager(tmp_path) as shards:
        return await fill_pool(
            shards=shards,
            storage=storage,
            generator=generator,
            verifier=verifier,
            course_id=course_id,
            case_study_id=case_study_id,
            target=target,
            budget=budget,
        )


async def test_the_fill_tops_the_pool_up_to_the_target(
    client: TestClient, tmp_path: Path, storage: FakeStorage
) -> None:
    headers = professor(client)
    course_id, case_study_id = make_case_study(client, headers, tmp_path)
    generator, verifier = AgreeingGenerator(), AgreeingVerifier()

    counts = await run_fill(
        tmp_path, storage, course_id, case_study_id,
        generator=generator, verifier=verifier, target=3,
    )

    assert counts["generated"] == 3
    assert generator.calls == 3
    conn = connect(tmp_path / "courses" / f"{course_id}.db")
    try:
        servable = conn.execute(
            "SELECT COUNT(*) FROM variants WHERE verification = 'verified'"
        ).fetchone()[0]
        # The accounting saw every call: 3 x (100+50) + 3 x (80+40).
        tokens = conn.execute(
            "SELECT SUM(input_tokens + output_tokens) FROM token_usage"
        ).fetchone()[0]
    finally:
        conn.close()
    assert servable == 3
    assert tokens == 3 * 150 + 3 * 120

    # A rerun finds the pool full and spends nothing.
    again = await run_fill(
        tmp_path, storage, course_id, case_study_id,
        generator=generator, verifier=verifier, target=3,
    )
    assert (again["attempts"], generator.calls) == (0, 3)


async def test_persistent_flagging_stops_at_the_attempt_ceiling(
    client: TestClient, tmp_path: Path, storage: FakeStorage
) -> None:
    headers = professor(client)
    course_id, case_study_id = make_case_study(client, headers, tmp_path)
    generator = AgreeingGenerator(answers=["42.00 EUR"])
    verifier = AgreeingVerifier(answers=["99.99 EUR"])  # always disagrees

    counts = await run_fill(
        tmp_path, storage, course_id, case_study_id,
        generator=generator, verifier=verifier, target=2,
    )

    # Bounded burn: 3x the target, then stop; the review queue holds the why.
    assert counts == {
        "attempts": 6, "generated": 0, "flagged": 6, "budget_exhausted": 0,
    }


async def test_an_exhausted_budget_stops_generation(
    client: TestClient, tmp_path: Path, storage: FakeStorage
) -> None:
    headers = professor(client)
    course_id, case_study_id = make_case_study(client, headers, tmp_path)
    generator, verifier = AgreeingGenerator(), AgreeingVerifier()

    counts = await run_fill(
        tmp_path, storage, course_id, case_study_id,
        generator=generator, verifier=verifier, target=3, budget=0,
    )

    assert counts["budget_exhausted"] == 1
    assert generator.calls == 0


def test_publishing_a_parameterized_case_study_enqueues_the_fill(
    client: TestClient, tmp_path: Path, queue: RecordingQueue
) -> None:
    headers = professor(client)
    course_id, case_study_id = make_case_study(
        client, headers, tmp_path, publish=True
    )
    assert queue.fills == [(course_id, case_study_id)]


def test_publishing_without_a_spec_enqueues_nothing(
    client: TestClient, tmp_path: Path, queue: RecordingQueue
) -> None:
    headers = professor(client)
    make_case_study(client, headers, tmp_path, with_spec=False, publish=True)
    assert queue.fills == []


def test_a_seat_gets_a_variant_and_never_a_solution(
    client: TestClient, tmp_path: Path, storage: FakeStorage
) -> None:
    headers = professor(client)
    course_id, case_study_id = make_case_study(
        client, headers, tmp_path, publish=True
    )
    seed_variant(tmp_path, course_id, case_study_id, seed=1)
    seat_headers = seat(client, headers, course_id, storage)

    r = client.get(
        f"/api/v1/courses/{course_id}/case-studies/{case_study_id}/practice-variant",
        headers=seat_headers,
    )

    assert r.status_code == 200, r.text
    body = r.json()
    assert body["variant_id"] is not None
    assert body["body"] == "Pool variant 1."
    # The whole response shape: never a solution, never a flag state.
    assert set(body) == set(PracticeVariantOut.model_fields)


def test_exclude_prefers_a_different_variant(
    client: TestClient, tmp_path: Path, storage: FakeStorage
) -> None:
    headers = professor(client)
    course_id, case_study_id = make_case_study(
        client, headers, tmp_path, publish=True
    )
    first = seed_variant(tmp_path, course_id, case_study_id, seed=1)
    second = seed_variant(tmp_path, course_id, case_study_id, seed=2)
    seat_headers = seat(client, headers, course_id, storage)
    url = f"/api/v1/courses/{course_id}/case-studies/{case_study_id}/practice-variant"

    for _ in range(5):
        r = client.get(url, params={"exclude": first}, headers=seat_headers)
        assert r.json()["variant_id"] == second

    # When only the excluded one exists, repeating it beats waiting.
    lone_url = url
    conn = connect(tmp_path / "courses" / f"{course_id}.db")
    try:
        conn.execute("DELETE FROM variants WHERE id = ?", (second,))
    finally:
        conn.close()
    r = client.get(lone_url, params={"exclude": first}, headers=seat_headers)
    assert r.json()["variant_id"] == first


def test_a_flagged_variant_is_never_practised(
    client: TestClient, tmp_path: Path, storage: FakeStorage
) -> None:
    headers = professor(client)
    course_id, case_study_id = make_case_study(
        client, headers, tmp_path, publish=True
    )
    seed_variant(tmp_path, course_id, case_study_id, seed=1, verification="flagged")
    seat_headers = seat(client, headers, course_id, storage)

    r = client.get(
        f"/api/v1/courses/{course_id}/case-studies/{case_study_id}/practice-variant",
        headers=seat_headers,
    )

    # The only variant is flagged, so the base case study serves instead.
    assert r.json() == {"variant_id": None, "body": BODY}


def test_a_draft_case_study_is_invisible_to_a_seat(
    client: TestClient, tmp_path: Path, storage: FakeStorage
) -> None:
    headers = professor(client)
    course_id, case_study_id = make_case_study(client, headers, tmp_path)
    seat_headers = seat(client, headers, course_id, storage)
    url = f"/api/v1/courses/{course_id}/case-studies/{case_study_id}/practice-variant"

    assert client.get(url, headers=seat_headers).status_code == 404
    assert client.get(url, headers=headers).status_code == 200  # owner sees drafts
    assert client.get(url).status_code == 401


def test_the_pool_invariant_under_load_with_an_empty_generation_budget(
    client: TestClient, tmp_path: Path, storage: FakeStorage, queue: RecordingQueue
) -> None:
    """The phase gate: a student's "new variant" request never waits on
    generation. With an empty pool and a zero generation budget (the fill
    job can spend nothing), fifty consecutive requests all answer instantly
    from what exists (the base case study), no model call ever runs on the
    request path, and the top-up only ever goes to the background queue."""
    headers = professor(client)
    course_id, case_study_id = make_case_study(
        client, headers, tmp_path, publish=True
    )
    seat_headers = seat(client, headers, course_id, storage)
    url = f"/api/v1/courses/{course_id}/case-studies/{case_study_id}/practice-variant"

    started = time.monotonic()
    for _ in range(50):
        r = client.get(url, headers=seat_headers)
        assert r.status_code == 200
        assert r.json() == {"variant_id": None, "body": BODY}
    elapsed = time.monotonic() - started

    assert elapsed < 5.0  # fifty instant answers, no generation wait anywhere
    assert all(fill == (course_id, case_study_id) for fill in queue.fills)
