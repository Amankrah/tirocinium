"""Milestone 5.2: auto-parameterization. One call proposes a complete draft
spec (parameters with rationales, invariants with rationales, the inferred
solution method) from the confirmed question and solution; the server computes
token positions from the model's literals (model offsets are never trusted),
applies the figure-frozen check to the proposal before the professor sees it,
and stores the proposal with provenance. The proposal is a draft only: saving
still goes through the 5.1 PUT, which logs the professor's edits against the
proposal as the prompt-quality signal (guide 6.2)."""

import hashlib
import io
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.compression import compress_text, decompress_text
from app.db.connection import connect
from app.main import create_app
from app.params.model import FigureReading, RecordedFigureReader, get_figure_reader
from app.params.proposal import (
    RecordedSpecProposer,
    SpecProposal,
    get_spec_proposer,
    proposal_document,
)
from app.storage import IMPORTS_BUCKET, get_object_storage

SECRET = "test-secret-not-for-production-0123"
PASSWORD = "a sensible passphrase"

FIGURE_BYTES = b"schematic-png-bytes"
FIGURE_HASH = hashlib.sha256(FIGURE_BYTES).hexdigest()

BODY = "Compute the NPV at a discount rate of 0.08 over 5 years."


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
def reader() -> RecordedFigureReader:
    return RecordedFigureReader(
        {FIGURE_HASH: FigureReading(values=["4.7 kΩ", "R1", "logistics"])}
    )


@pytest.fixture()
def proposer() -> RecordedSpecProposer:
    return RecordedSpecProposer({})


@pytest.fixture()
def client(
    tmp_path: Path,
    storage: FakeStorage,
    reader: RecordedFigureReader,
    proposer: RecordedSpecProposer,
) -> Iterator[TestClient]:
    app = create_app(data_dir=tmp_path, jwt_secret=SECRET)
    app.dependency_overrides[get_object_storage] = lambda: storage
    app.dependency_overrides[get_figure_reader] = lambda: reader
    app.dependency_overrides[get_spec_proposer] = lambda: proposer
    with TestClient(app) as c:
        yield c


def professor(client: TestClient, email: str = "prof@example.edu") -> dict[str, str]:
    r = client.post("/api/v1/auth/signup", json={"email": email, "password": PASSWORD})
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def make_course(client: TestClient, headers: dict[str, str]) -> int:
    r = client.post("/api/v1/courses", json={"title": "FDSC 315"}, headers=headers)
    assert r.status_code == 201, r.text
    return int(r.json()["id"])


def make_case_study(
    client: TestClient, headers: dict[str, str], course_id: int, body: str = BODY
) -> int:
    r = client.post(
        f"/api/v1/courses/{course_id}/case-studies",
        json={"title": "NPV", "body": body},
        headers=headers,
    )
    assert r.status_code == 201, r.text
    return int(r.json()["id"])


def make_case_study_with_figure(
    client: TestClient,
    headers: dict[str, str],
    tmp_path: Path,
    storage: FakeStorage,
    course_id: int,
) -> tuple[int, int, str, str]:
    """A case study born from a confirmed import item with one essential figure.
    Returns (case_study_id, figure_id, question_md, solution_md)."""
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
            " height_px, caption, created_at)"
            " VALUES (?, ?, 'embedded_raster', 10, 10, 'Figure 2', 0)",
            (FIGURE_HASH, storage_key),
        )
        figure_id = int(figure.lastrowid or 0)
        question = f"Find the current through the 4.7 kΩ resistor. ![f](fig://{figure_id})"
        solution = "By Ohm's law, I = V/R = 12 / 4700 A."
        item = conn.execute(
            "INSERT INTO import_items (job_id, title, question_z, solution_z,"
            " page_span, confidence, notes, model_id, prompt_version, state)"
            " VALUES (?, 'Circuit', ?, ?, '0', 0.9, NULL, 'm', 'v1', 'pending')",
            (
                int(job.lastrowid or 0),
                compress_text(conn, "problem_text", question),
                compress_text(conn, "problem_text", solution),
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
    return int(r.json()["case_study_id"]), figure_id, question, solution


def propose_url(course_id: int, case_study_id: int) -> str:
    return (
        f"/api/v1/courses/{course_id}/case-studies/{case_study_id}/auto-parameterize"
    )


def spec_url(course_id: int, case_study_id: int) -> str:
    return f"/api/v1/courses/{course_id}/case-studies/{case_study_id}/param-spec"


PROPOSAL = SpecProposal.model_validate(
    {
        "parameters": {
            "discount_rate": {
                "type": "number",
                "base": 0.08,
                "range": [0.04, 0.12],
                "step": 0.005,
                "literal": "0.08",
                "rationale": "The rate drives the discounting without changing the method.",
            },
            "cashflow_years": {
                "type": "integer",
                "base": 5,
                "range": [4, 8],
                "literal": "5",
                "rationale": "More or fewer years keeps the same computation.",
            },
        },
        "invariants": [
            {
                "text": "The NPV must be positive in the base scenario",
                "rationale": "Keeps the decision from flipping unintentionally.",
            }
        ],
        "solution_method": "Discount each year's cashflow and sum.",
    }
)


def test_a_proposal_returns_a_draft_spec_with_annotations(
    client: TestClient, tmp_path: Path, proposer: RecordedSpecProposer
) -> None:
    headers = professor(client)
    course_id = make_course(client, headers)
    case_study_id = make_case_study(client, headers, course_id)
    document = proposal_document(BODY, None, [])
    proposer.record(document, PROPOSAL)

    r = client.post(propose_url(course_id, case_study_id), headers=headers)

    assert r.status_code == 200, r.text
    body = r.json()
    assert body["spec"]["parameters"]["discount_rate"]["base"] == 0.08
    assert body["spec"]["invariants"] == [
        "The NPV must be positive in the base scenario"
    ]
    assert body["spec"]["solution_method"] == "Discount each year's cashflow and sum."
    # Token positions are computed server-side from the literal, so the
    # frontend can highlight exactly what would vary.
    ann = body["annotations"]["discount_rate"]
    start = BODY.index("0.08")
    assert ann["positions"] == [[start, start + 4]]
    assert ann["literal"] == "0.08"
    assert "discounting" in ann["rationale"]
    assert body["invariant_rationales"] == [
        "Keeps the decision from flipping unintentionally."
    ]
    assert body["frozen"] == []
    assert body["provenance"]["prompt_version"] == "auto-parameterize/v1"
    # The proposal is stored with provenance, compressed.
    conn = connect(tmp_path / "courses" / f"{course_id}.db")
    try:
        row = conn.execute(
            "SELECT payload_z, model_id, prompt_version FROM spec_proposals"
            " WHERE case_study_id = ?",
            (case_study_id,),
        ).fetchone()
        assert row is not None
        assert bytes(row[0])[:4] == b"\x28\xb5\x2f\xfd"
        assert "discount_rate" in decompress_text(
            conn, "problem_text", bytes(row[0])
        )
        assert str(row[2]) == "auto-parameterize/v1"
    finally:
        conn.close()
    # Nothing was saved as the spec: the proposal is a draft, the professor
    # disposes through the PUT.
    assert client.get(spec_url(course_id, case_study_id), headers=headers).status_code == 404


def test_the_document_carries_solution_and_frozen_values_but_never_figure_bytes(
    client: TestClient,
    tmp_path: Path,
    storage: FakeStorage,
    proposer: RecordedSpecProposer,
) -> None:
    headers = professor(client)
    course_id = make_course(client, headers)
    case_study_id, figure_id, question, solution = make_case_study_with_figure(
        client, headers, tmp_path, storage, course_id
    )
    document = proposal_document(
        question, solution, ["4.7 kΩ", "R1", "logistics"]
    )
    proposer.record(document, SpecProposal.model_validate({"parameters": {}}))

    r = client.post(propose_url(course_id, case_study_id), headers=headers)

    assert r.status_code == 200, r.text
    assert proposer.calls == 1
    seen = proposer.documents[0]
    assert f"fig://{figure_id}" in seen  # the token travels, never the bytes
    assert "Ohm's law" in seen  # the confirmed solution informs the proposal
    assert "4.7 kΩ" in seen  # the frozen values steer the model away
    assert FIGURE_BYTES.decode("latin1") not in seen


def test_a_proposed_parameter_frozen_by_a_figure_is_locked_out(
    client: TestClient,
    tmp_path: Path,
    storage: FakeStorage,
    proposer: RecordedSpecProposer,
) -> None:
    headers = professor(client)
    course_id = make_course(client, headers)
    case_study_id, figure_id, question, solution = make_case_study_with_figure(
        client, headers, tmp_path, storage, course_id
    )
    document = proposal_document(question, solution, ["4.7 kΩ", "R1", "logistics"])
    proposer.record(
        document,
        SpecProposal.model_validate(
            {
                "parameters": {
                    "resistance": {
                        "type": "number",
                        "base": 4.7,
                        "range": [1.0, 10.0],
                        "literal": "4.7",
                        "rationale": "Vary the resistor.",
                    },
                    "supply_voltage": {
                        "type": "number",
                        "base": 12.0,
                        "range": [6.0, 24.0],
                        "literal": "12",
                        "rationale": "Vary the supply.",
                    },
                }
            }
        ),
    )

    r = client.post(propose_url(course_id, case_study_id), headers=headers)

    assert r.status_code == 200, r.text
    body = r.json()
    # The frozen check ran on the proposal before the professor saw it: the
    # resistor value is printed in the schematic, so it is locked with the
    # reason, and only the clean parameter survives into the draft spec.
    assert list(body["spec"]["parameters"]) == ["supply_voltage"]
    assert len(body["frozen"]) == 1
    assert body["frozen"][0]["parameter"] == "resistance"
    assert body["frozen"][0]["figure_id"] == figure_id
    assert body["frozen"][0]["value"] == "4.7 kΩ"
    assert "decorative" in body["frozen"][0]["reason"]
    assert list(body["annotations"]) == ["supply_voltage"]


def test_an_unfindable_literal_yields_no_positions(
    client: TestClient, proposer: RecordedSpecProposer
) -> None:
    headers = professor(client)
    course_id = make_course(client, headers)
    case_study_id = make_case_study(client, headers, course_id)
    proposer.record(
        proposal_document(BODY, None, []),
        SpecProposal.model_validate(
            {
                "parameters": {
                    "phantom": {
                        "type": "number",
                        "base": 9.99,
                        "range": [1.0, 20.0],
                        "literal": "9.99",
                        "rationale": "Not actually in the text.",
                    }
                }
            }
        ),
    )

    r = client.post(propose_url(course_id, case_study_id), headers=headers)

    assert r.status_code == 200
    # A literal the question does not contain gets no positions: better an
    # honest empty list than a hallucinated highlight.
    assert r.json()["annotations"]["phantom"]["positions"] == []


def test_a_retry_with_the_same_idempotency_key_replays_the_proposal(
    client: TestClient, proposer: RecordedSpecProposer
) -> None:
    headers = professor(client)
    course_id = make_course(client, headers)
    case_study_id = make_case_study(client, headers, course_id)
    proposer.record(proposal_document(BODY, None, []), PROPOSAL)

    first = client.post(
        propose_url(course_id, case_study_id),
        headers={**headers, "Idempotency-Key": "k-1"},
    )
    second = client.post(
        propose_url(course_id, case_study_id),
        headers={**headers, "Idempotency-Key": "k-1"},
    )

    assert first.status_code == second.status_code == 200
    assert first.json()["proposal_id"] == second.json()["proposal_id"]
    assert first.json() == second.json()
    assert proposer.calls == 1  # the retry never re-runs the model


def test_saving_after_a_proposal_logs_the_edit_signal(
    client: TestClient, tmp_path: Path, proposer: RecordedSpecProposer
) -> None:
    headers = professor(client)
    course_id = make_course(client, headers)
    case_study_id = make_case_study(client, headers, course_id)
    proposer.record(proposal_document(BODY, None, []), PROPOSAL)
    proposal_id = client.post(
        propose_url(course_id, case_study_id), headers=headers
    ).json()["proposal_id"]

    # The professor keeps discount_rate but widens its range (changed), drops
    # cashflow_years, adds company_sector, and adds an invariant.
    saved = {
        "parameters": {
            "discount_rate": {
                "type": "number",
                "base": 0.08,
                "range": [0.02, 0.2],
                "step": 0.005,
            },
            "company_sector": {
                "type": "choice",
                "base": "logistics",
                "options": ["logistics", "retail"],
            },
        },
        "invariants": [
            "The NPV must be positive in the base scenario",
            "Difficulty must remain equivalent to the original",
        ],
        "solution_method": "Discount each year's cashflow and sum.",
    }
    r = client.put(spec_url(course_id, case_study_id), json=saved, headers=headers)
    assert r.status_code == 200, r.text

    conn = connect(tmp_path / "courses" / f"{course_id}.db")
    try:
        row = conn.execute(
            "SELECT saved_at, parameters_kept, parameters_changed,"
            " parameters_dropped, parameters_added, invariants_edit_distance"
            " FROM spec_proposals WHERE id = ?",
            (proposal_id,),
        ).fetchone()
    finally:
        conn.close()
    assert row is not None and row[0] is not None
    assert (int(row[1]), int(row[2]), int(row[3]), int(row[4])) == (0, 1, 1, 1)
    assert int(row[5]) > 0

    # A second save has no unsaved proposal left to log against.
    again = client.put(spec_url(course_id, case_study_id), json=saved, headers=headers)
    assert again.status_code == 200


def test_non_owner_is_403(client: TestClient) -> None:
    owner = professor(client)
    course_id = make_course(client, owner)
    case_study_id = make_case_study(client, owner, course_id)
    other = professor(client, email="other@example.edu")
    assert (
        client.post(propose_url(course_id, case_study_id), headers=other).status_code
        == 403
    )


def test_unauthenticated_is_401(client: TestClient) -> None:
    headers = professor(client)
    course_id = make_course(client, headers)
    case_study_id = make_case_study(client, headers, course_id)
    assert client.post(propose_url(course_id, case_study_id)).status_code == 401


def test_unknown_case_study_is_404(client: TestClient) -> None:
    headers = professor(client)
    course_id = make_course(client, headers)
    assert (
        client.post(propose_url(course_id, 999999), headers=headers).status_code == 404
    )
