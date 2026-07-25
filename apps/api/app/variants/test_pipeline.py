"""Milestone 5.3: the generation and verification loop, including the phase
gate's adversarial property: a deliberately corrupted variant (text
contradicting its figure, a wrong solution, a dropped figure token, missing
answers) is always flagged and never appears in the verified list, across a
seeded suite. Model calls are recorded seams; the comparer is the Rust one."""

import hashlib
import io
import json
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.compression import compress_text, decompress_text
from app.db import ShardManager
from app.db.connection import connect
from app.main import create_app
from app.params.schema import ParamSpec
from app.storage import IMPORTS_BUCKET, get_object_storage
from app.variants.model import (
    GeneratedVariant,
    RecordedVariantGenerator,
    RecordedVariantVerifier,
    ReSolveResult,
)
from app.variants.pipeline import (
    generate_variant,
    generation_document,
    verification_document,
)
from app.variants.sampling import sample_values

SECRET = "test-secret-not-for-production-0123"
PASSWORD = "a sensible passphrase"

FIGURE_BYTES = b"schematic-png-bytes"
FIGURE_HASH = hashlib.sha256(FIGURE_BYTES).hexdigest()

SOLUTION = "By Ohm's law, I = V/R = 12 / 4700 A."

SPEC = ParamSpec.model_validate(
    {
        "parameters": {
            "supply_voltage": {
                "type": "number",
                "base": 12.0,
                "range": [6.0, 24.0],
                "step": 0.5,
            }
        },
        "invariants": ["The current must stay in the milliamp range"],
        "solution_method": "Apply Ohm's law.",
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


def seed_case_study(
    client: TestClient,
    headers: dict[str, str],
    tmp_path: Path,
    storage: FakeStorage,
) -> tuple[int, int, str]:
    """A course with one confirmed, spec'd case study carrying one essential
    figure. Returns (course_id, case_study_id, question_md)."""
    r = client.post("/api/v1/courses", json={"title": "EE 201"}, headers=headers)
    course_id = int(r.json()["id"])
    assert (
        client.get(
            f"/api/v1/courses/{course_id}/case-studies", headers=headers
        ).status_code
        == 200
    )
    storage_key = f"imports/{course_id}/figures/{FIGURE_HASH}.png"
    storage.objects[(IMPORTS_BUCKET, storage_key)] = FIGURE_BYTES
    conn = connect(tmp_path / "courses" / f"{course_id}.db")
    try:
        job = conn.execute(
            "INSERT INTO import_jobs (course_id, storage_key, status, created_at)"
            " VALUES (?, 'k', 'ready', 0)",
            (course_id,),
        )
        figure = conn.execute(
            "INSERT INTO figures (content_hash, storage_key, source, width_px,"
            " height_px, created_at) VALUES (?, ?, 'embedded_raster', 10, 10, 0)",
            (FIGURE_HASH, storage_key),
        )
        figure_id = int(figure.lastrowid or 0)
        question = (
            f"A 12 V supply feeds the circuit. ![f](fig://{figure_id})"
            " Find the current."
        )
        item = conn.execute(
            "INSERT INTO import_items (job_id, title, question_z, solution_z,"
            " page_span, confidence, notes, model_id, prompt_version, state)"
            " VALUES (?, 'Circuit', ?, ?, '0', 0.9, NULL, 'm', 'v1', 'pending')",
            (
                int(job.lastrowid or 0),
                compress_text(conn, "problem_text", question),
                compress_text(conn, "problem_text", SOLUTION),
            ),
        )
        conn.execute(
            "INSERT INTO item_figures (item_id, figure_id, role)"
            " VALUES (?, ?, 'essential')",
            (int(item.lastrowid or 0), figure_id),
        )
        item_id = int(item.lastrowid or 0)
    finally:
        conn.close()
    r = client.post(
        f"/api/v1/courses/{course_id}/import-items/{item_id}/confirm", headers=headers
    )
    assert r.status_code == 200, r.text
    case_study_id = int(r.json()["case_study_id"])
    conn = connect(tmp_path / "courses" / f"{course_id}.db")
    try:
        conn.execute(
            "UPDATE case_studies SET param_spec_z = ? WHERE id = ?",
            (
                compress_text(conn, "problem_text", SPEC.model_dump_json()),
                case_study_id,
            ),
        )
    finally:
        conn.close()
    return course_id, case_study_id, question


def make_seams(
    question: str,
    seed: int,
    *,
    variant_body: str | None = None,
    generated_answers: list[str] | None = None,
    resolved_answers: list[str] | None = None,
) -> tuple[RecordedVariantGenerator, RecordedVariantVerifier]:
    """Recorded generator and verifier for one seed, defaulting to an
    agreeing pair over a token-faithful variant."""
    values = sample_values(SPEC, seed)
    bases = {name: p.base for name, p in SPEC.parameters.items()}
    body = (
        variant_body
        if variant_body is not None
        else question.replace("12 V", f"{values['supply_voltage']} V")
    )
    generated = GeneratedVariant(
        body_md=body,
        solution_md="I = V/R.",
        final_answers=generated_answers if generated_answers is not None else ["2.553 mA"],
    )
    generator = RecordedVariantGenerator({})
    generator.record(
        generation_document(
            question, SOLUTION, values, bases, SPEC.invariants, SPEC.solution_method
        ),
        generated,
    )
    verifier = RecordedVariantVerifier({})
    verifier.record(
        verification_document(body),
        ReSolveResult(
            solution_md="Independently, I = V/R.",
            final_answers=resolved_answers if resolved_answers is not None else ["2.55 mA"],
        ),
    )
    return generator, verifier


def variant_row(tmp_path: Path, course_id: int, seed: int) -> Any:
    conn = connect(tmp_path / "courses" / f"{course_id}.db")
    try:
        return conn.execute(
            "SELECT verification, flag_reason, seed_json_z, body_z, solution_z,"
            " verify_solution_z, model_id, verify_model_id,"
            " generation_prompt_version, verification_prompt_version"
            " FROM variants WHERE seed = ?",
            (seed,),
        ).fetchone()
    finally:
        conn.close()


async def run(
    tmp_path: Path,
    storage: FakeStorage,
    course_id: int,
    case_study_id: int,
    seed: int,
    generator: RecordedVariantGenerator,
    verifier: RecordedVariantVerifier,
) -> str:
    async with ShardManager(tmp_path) as shards:
        return await generate_variant(
            shards=shards,
            storage=storage,
            generator=generator,
            verifier=verifier,
            course_id=course_id,
            case_study_id=case_study_id,
            seed=seed,
        )


async def test_an_agreeing_variant_is_verified_with_full_provenance(
    client: TestClient, tmp_path: Path, storage: FakeStorage
) -> None:
    headers = professor(client)
    course_id, case_study_id, question = seed_case_study(
        client, headers, tmp_path, storage
    )
    generator, verifier = make_seams(question, 42)

    state = await run(
        tmp_path, storage, course_id, case_study_id, 42, generator, verifier
    )

    assert state == "verified"
    row = variant_row(tmp_path, course_id, 42)
    assert row is not None
    assert (str(row[0]), row[1]) == ("verified", None)
    conn = connect(tmp_path / "courses" / f"{course_id}.db")
    try:
        values = json.loads(decompress_text(conn, "problem_text", bytes(row[2])))
        assert values == sample_values(SPEC, 42)
        body = decompress_text(conn, "problem_text", bytes(row[3]))
        assert "fig://" in body  # the professor's figure travels untouched
        solution = json.loads(decompress_text(conn, "problem_text", bytes(row[4])))
        assert solution["final_answers"] == ["2.553 mA"]
        assert "Independently" in decompress_text(
            conn, "problem_text", bytes(row[5])
        )
    finally:
        conn.close()
    assert str(row[8]) == "variant-generation/v1"
    assert str(row[9]) == "variant-verification/v1"
    # The verifier saw the figures as pixels and only the variant's question.
    assert verifier.images == [[FIGURE_BYTES]]
    assert "I = V/R." not in verifier.documents[0]


async def test_a_disagreeing_re_solve_flags_the_variant(
    client: TestClient, tmp_path: Path, storage: FakeStorage
) -> None:
    headers = professor(client)
    course_id, case_study_id, question = seed_case_study(
        client, headers, tmp_path, storage
    )
    generator, verifier = make_seams(
        question, 7, generated_answers=["2.553 mA"], resolved_answers=["5.1 mA"]
    )

    state = await run(
        tmp_path, storage, course_id, case_study_id, 7, generator, verifier
    )

    assert state == "flagged"
    row = variant_row(tmp_path, course_id, 7)
    assert str(row[0]) == "flagged"
    assert "re-solve disagrees" in str(row[1])


async def test_altered_figure_tokens_flag_without_spending_the_verify_call(
    client: TestClient, tmp_path: Path, storage: FakeStorage
) -> None:
    headers = professor(client)
    course_id, case_study_id, question = seed_case_study(
        client, headers, tmp_path, storage
    )
    generator, verifier = make_seams(
        question, 9, variant_body="A rewritten problem with no figure token."
    )

    state = await run(
        tmp_path, storage, course_id, case_study_id, 9, generator, verifier
    )

    assert state == "flagged"
    assert "figure tokens" in str(variant_row(tmp_path, course_id, 9)[1])
    assert verifier.calls == 0


async def test_missing_final_answers_flag(
    client: TestClient, tmp_path: Path, storage: FakeStorage
) -> None:
    headers = professor(client)
    course_id, case_study_id, question = seed_case_study(
        client, headers, tmp_path, storage
    )
    generator, verifier = make_seams(question, 11, generated_answers=[])

    state = await run(
        tmp_path, storage, course_id, case_study_id, 11, generator, verifier
    )

    assert state == "flagged"
    assert "no final answers" in str(variant_row(tmp_path, course_id, 11)[1])
    assert verifier.calls == 0


async def test_a_seed_is_generated_once(
    client: TestClient, tmp_path: Path, storage: FakeStorage
) -> None:
    headers = professor(client)
    course_id, case_study_id, question = seed_case_study(
        client, headers, tmp_path, storage
    )
    generator, verifier = make_seams(question, 42)
    first = await run(
        tmp_path, storage, course_id, case_study_id, 42, generator, verifier
    )
    second = await run(
        tmp_path, storage, course_id, case_study_id, 42, generator, verifier
    )

    assert (first, second) == ("verified", "exists")
    assert generator.calls == 1  # the retry never re-ran a model


async def test_without_a_spec_nothing_generates(
    client: TestClient, tmp_path: Path, storage: FakeStorage
) -> None:
    headers = professor(client)
    r = client.post("/api/v1/courses", json={"title": "EE 201"}, headers=headers)
    course_id = int(r.json()["id"])
    r = client.post(
        f"/api/v1/courses/{course_id}/case-studies",
        json={"title": "Plain", "body": "No spec here."},
        headers=headers,
    )
    generator, verifier = RecordedVariantGenerator({}), RecordedVariantVerifier({})

    state = await run(
        tmp_path, storage, course_id, int(r.json()["id"]), 1, generator, verifier
    )

    assert state == "no_spec"
    assert generator.calls == 0


CORRUPTIONS: list[tuple[str, dict[str, object]]] = [
    # The generated solution is simply wrong; the cold re-solve gets the
    # right answer and they disagree.
    ("wrong_solution", {"resolved_answers": ["9.9 mA"]}),
    # The variant's text contradicts its figure (the figure still shows the
    # base values), so the re-solve, answering from the figure as its prompt
    # instructs, lands on a different number.
    ("figure_contradiction", {"resolved_answers": ["From the figure's values, I = 4.8 mA"]}),
    # The generator dropped the professor's figure.
    ("dropped_token", {"variant_body": "A problem that lost its figure."}),
    # Nothing to verify at all.
    ("no_answers", {"generated_answers": []}),
]


@pytest.mark.parametrize("seed", [101, 202, 303])
@pytest.mark.parametrize(("name", "kwargs"), CORRUPTIONS)
async def test_a_corrupted_variant_is_always_flagged_and_never_served(
    client: TestClient,
    tmp_path: Path,
    storage: FakeStorage,
    seed: int,
    name: str,
    kwargs: dict[str, object],
) -> None:
    """The phase gate's verification property, across a seeded adversarial
    suite: every corruption mode lands on flagged, and the verified list (the
    only state 5.4's pool will serve from) never contains it."""
    headers = professor(client)
    course_id, case_study_id, question = seed_case_study(
        client, headers, tmp_path, storage
    )
    generator, verifier = make_seams(question, seed, **kwargs)  # type: ignore[arg-type]

    state = await run(
        tmp_path, storage, course_id, case_study_id, seed, generator, verifier
    )

    assert state == "flagged", f"corruption {name} seed {seed} was not flagged"
    listed = client.get(
        f"/api/v1/courses/{course_id}/case-studies/{case_study_id}/variants",
        params={"state": "verified"},
        headers=headers,
    )
    assert listed.status_code == 200
    assert listed.json()["items"] == []  # flagged is never served, anywhere
    flagged = client.get(
        f"/api/v1/courses/{course_id}/case-studies/{case_study_id}/variants",
        params={"state": "flagged"},
        headers=headers,
    )
    assert [v["seed"] for v in flagged.json()["items"]] == [seed]
