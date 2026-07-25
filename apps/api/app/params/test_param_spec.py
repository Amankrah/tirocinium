"""Milestone 5.1: the parameter spec and the figure-frozen check. The editor
panel backend stores a typed spec (backend guide 6.1) on the case study,
compressed at rest; saving a spec runs the frozen check, which reads each
essential figure's displayed values through a vision seam (recorded in tests,
cached by figure content hash) and blocks any parameter whose base value
appears inside a figure, with the stated reason. Marking the figure decorative
is one of the professor's two escape hatches, and it unblocks the save."""

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
from app.storage import IMPORTS_BUCKET, get_object_storage

SECRET = "test-secret-not-for-production-0123"
PASSWORD = "a sensible passphrase"

FIGURE_BYTES = b"schematic-png-bytes"
FIGURE_HASH = hashlib.sha256(FIGURE_BYTES).hexdigest()

SPEC = {
    "parameters": {
        "discount_rate": {
            "type": "number",
            "base": 0.08,
            "range": [0.04, 0.12],
            "step": 0.005,
        },
        "company_sector": {
            "type": "choice",
            "base": "logistics",
            "options": ["agri-processing", "logistics", "retail"],
        },
        "cashflow_years": {"type": "integer", "base": 5, "range": [4, 8]},
        "company_name": {
            "type": "entity",
            "base": "Veltri Freight",
            "description": "a small regional company",
        },
    },
    "invariants": ["The NPV must be positive in the base scenario"],
    "solution_method": "Discount each year's cashflow and sum.",
}


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
    # The schematic displays a resistor value, a label, and a sector name.
    return RecordedFigureReader(
        {FIGURE_HASH: FigureReading(values=["4.7 kΩ", "R1", "logistics"])}
    )


@pytest.fixture()
def client(
    tmp_path: Path, storage: FakeStorage, reader: RecordedFigureReader
) -> Iterator[TestClient]:
    app = create_app(data_dir=tmp_path, jwt_secret=SECRET)
    app.dependency_overrides[get_object_storage] = lambda: storage
    app.dependency_overrides[get_figure_reader] = lambda: reader
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


def seat_token(
    client: TestClient, headers: dict[str, str], course_id: int, storage: FakeStorage
) -> str:
    r = client.post(
        f"/api/v1/courses/{course_id}/seats", json={"count": 1}, headers=headers
    )
    assert r.status_code == 201, r.text
    csv_bytes = next(
        data for (_, key), data in storage.objects.items() if key.endswith(".csv")
    )
    code = csv_bytes.decode().strip().splitlines()[1].split(",")[1]
    redeemed = client.post("/api/v1/seats/redeem", json={"code": code})
    assert redeemed.status_code == 200, redeemed.text
    return str(redeemed.json()["token"])


def make_case_study(client: TestClient, headers: dict[str, str], course_id: int) -> int:
    r = client.post(
        f"/api/v1/courses/{course_id}/case-studies",
        json={"title": "NPV", "body": "Compute the NPV at a discount rate of 0.08."},
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
) -> tuple[int, int]:
    """A case study born from a confirmed import item carrying one essential
    figure, the way every figure-bearing case study is born. Returns
    (case_study_id, figure_id)."""
    # A course-scoped read opens and migrates the shard before we seed it.
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
        item = conn.execute(
            "INSERT INTO import_items (job_id, title, question_z, solution_z,"
            " page_span, confidence, notes, model_id, prompt_version, state)"
            " VALUES (?, 'NPV', ?, ?, '0', 0.9, NULL, 'm', 'v1', 'pending')",
            (
                int(job.lastrowid or 0),
                compress_text(
                    conn, "problem_text", f"The circuit. ![f](fig://{figure_id})"
                ),
                compress_text(conn, "problem_text", "I = V/R"),
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
    return int(r.json()["case_study_id"]), figure_id


def spec_url(course_id: int, case_study_id: int) -> str:
    return f"/api/v1/courses/{course_id}/case-studies/{case_study_id}/param-spec"


def test_put_and_get_round_trip_compressed_at_rest(
    client: TestClient, tmp_path: Path
) -> None:
    headers = professor(client)
    course_id = make_course(client, headers)
    case_study_id = make_case_study(client, headers, course_id)

    put = client.put(spec_url(course_id, case_study_id), json=SPEC, headers=headers)
    assert put.status_code == 200, put.text
    got = client.get(spec_url(course_id, case_study_id), headers=headers)
    assert got.status_code == 200
    body = got.json()
    assert body["parameters"]["discount_rate"]["base"] == 0.08
    assert body["parameters"]["company_sector"]["options"] == [
        "agri-processing",
        "logistics",
        "retail",
    ]
    assert body["invariants"] == SPEC["invariants"]
    assert body["solution_method"] == SPEC["solution_method"]

    # Stored compressed through the codec (zstd magic), decompressing to JSON.
    conn = connect(tmp_path / "courses" / f"{course_id}.db")
    try:
        blob = conn.execute(
            "SELECT param_spec_z FROM case_studies WHERE id = ?", (case_study_id,)
        ).fetchone()[0]
        assert bytes(blob)[:4] == b"\x28\xb5\x2f\xfd"
        assert '"discount_rate"' in decompress_text(conn, "problem_text", bytes(blob))
    finally:
        conn.close()


def test_get_without_a_spec_is_404(client: TestClient) -> None:
    headers = professor(client)
    course_id = make_course(client, headers)
    case_study_id = make_case_study(client, headers, course_id)
    r = client.get(spec_url(course_id, case_study_id), headers=headers)
    assert r.status_code == 404


def test_delete_clears_the_spec(client: TestClient) -> None:
    headers = professor(client)
    course_id = make_course(client, headers)
    case_study_id = make_case_study(client, headers, course_id)
    client.put(spec_url(course_id, case_study_id), json=SPEC, headers=headers)

    assert (
        client.delete(spec_url(course_id, case_study_id), headers=headers).status_code
        == 204
    )
    assert client.get(spec_url(course_id, case_study_id), headers=headers).status_code == 404


@pytest.mark.parametrize(
    "broken",
    [
        # Inverted range.
        {"type": "number", "base": 0.5, "range": [0.9, 0.1]},
        # Base outside the range.
        {"type": "number", "base": 0.2, "range": [0.4, 0.9]},
        # Base not one of the options.
        {"type": "choice", "base": "shipping", "options": ["retail", "logistics"]},
        # A step that cannot advance.
        {"type": "number", "base": 0.5, "range": [0.1, 0.9], "step": 0},
        # Unknown parameter type.
        {"type": "matrix", "base": 1},
        # Integer range with a float endpoint.
        {"type": "integer", "base": 5, "range": [4, 8.5]},
    ],
)
def test_invalid_parameters_are_rejected(
    client: TestClient, broken: dict[str, Any]
) -> None:
    headers = professor(client)
    course_id = make_course(client, headers)
    case_study_id = make_case_study(client, headers, course_id)
    r = client.put(
        spec_url(course_id, case_study_id),
        json={"parameters": {"p": broken}},
        headers=headers,
    )
    assert r.status_code == 422, r.text


def test_a_parameter_name_must_be_a_clean_token(client: TestClient) -> None:
    headers = professor(client)
    course_id = make_course(client, headers)
    case_study_id = make_case_study(client, headers, course_id)
    r = client.put(
        spec_url(course_id, case_study_id),
        json={
            "parameters": {
                "Discount Rate!": {"type": "number", "base": 1, "range": [0, 2]}
            }
        },
        headers=headers,
    )
    assert r.status_code == 422


def test_a_value_shown_in_a_figure_is_blocked(
    client: TestClient,
    tmp_path: Path,
    storage: FakeStorage,
    reader: RecordedFigureReader,
) -> None:
    headers = professor(client)
    course_id = make_course(client, headers)
    case_study_id, figure_id = make_case_study_with_figure(
        client, headers, tmp_path, storage, course_id
    )

    spec = {
        "parameters": {
            "resistance": {"type": "number", "base": 4.7, "range": [1.0, 10.0]}
        }
    }
    r = client.put(spec_url(course_id, case_study_id), json=spec, headers=headers)

    assert r.status_code == 409, r.text
    assert r.headers["content-type"].startswith("application/problem+json")
    body = r.json()
    blocked = body["blocked"]
    assert len(blocked) == 1
    assert blocked[0]["parameter"] == "resistance"
    assert blocked[0]["figure_id"] == figure_id
    assert blocked[0]["value"] == "4.7 kΩ"
    assert "appears in" in blocked[0]["reason"]
    assert "decorative" in blocked[0]["reason"]
    # Nothing was stored.
    assert client.get(spec_url(course_id, case_study_id), headers=headers).status_code == 404


def test_a_choice_value_shown_in_a_figure_is_blocked(
    client: TestClient, tmp_path: Path, storage: FakeStorage
) -> None:
    headers = professor(client)
    course_id = make_course(client, headers)
    case_study_id, _figure_id = make_case_study_with_figure(
        client, headers, tmp_path, storage, course_id
    )

    spec = {
        "parameters": {
            "company_sector": {
                "type": "choice",
                "base": "logistics",
                "options": ["logistics", "retail"],
            }
        }
    }
    r = client.put(spec_url(course_id, case_study_id), json=spec, headers=headers)
    assert r.status_code == 409
    assert r.json()["blocked"][0]["parameter"] == "company_sector"


def test_marking_the_figure_decorative_unblocks(
    client: TestClient, tmp_path: Path, storage: FakeStorage
) -> None:
    headers = professor(client)
    course_id = make_course(client, headers)
    case_study_id, figure_id = make_case_study_with_figure(
        client, headers, tmp_path, storage, course_id
    )
    spec = {
        "parameters": {
            "resistance": {"type": "number", "base": 4.7, "range": [1.0, 10.0]}
        }
    }
    assert (
        client.put(spec_url(course_id, case_study_id), json=spec, headers=headers)
        .status_code
        == 409
    )

    # The professor's escape hatch: mark the figure decorative (figure verb),
    # which takes it out of AI context and out of the frozen set.
    conn = connect(tmp_path / "courses" / f"{course_id}.db")
    try:
        item_id = conn.execute(
            "SELECT id FROM import_items WHERE case_study_id = ?", (case_study_id,)
        ).fetchone()[0]
    finally:
        conn.close()
    verb = client.put(
        f"/api/v1/courses/{course_id}/import-items/{item_id}/figures/{figure_id}",
        json={"role": "decorative"},
        headers=headers,
    )
    assert verb.status_code == 204, verb.text

    assert (
        client.put(spec_url(course_id, case_study_id), json=spec, headers=headers)
        .status_code
        == 200
    )


def test_figure_readings_are_cached_by_content_hash(
    client: TestClient,
    tmp_path: Path,
    storage: FakeStorage,
    reader: RecordedFigureReader,
) -> None:
    headers = professor(client)
    course_id = make_course(client, headers)
    case_study_id, _figure_id = make_case_study_with_figure(
        client, headers, tmp_path, storage, course_id
    )
    spec = {
        "parameters": {"years": {"type": "integer", "base": 5, "range": [4, 8]}}
    }

    first = client.put(spec_url(course_id, case_study_id), json=spec, headers=headers)
    second = client.put(spec_url(course_id, case_study_id), json=spec, headers=headers)

    assert first.status_code == second.status_code == 200
    assert reader.calls == 1  # the second save reads the cache, not the model
    conn = connect(tmp_path / "courses" / f"{course_id}.db")
    try:
        row = conn.execute(
            "SELECT values_json, model_id, prompt_version FROM figure_readings"
            " WHERE content_hash = ?",
            (FIGURE_HASH,),
        ).fetchone()
    finally:
        conn.close()
    assert row is not None
    assert "4.7" in str(row[0])
    assert str(row[2]) == "figure-reading/v1"


def test_a_case_study_without_figures_calls_no_model(
    client: TestClient, reader: RecordedFigureReader
) -> None:
    headers = professor(client)
    course_id = make_course(client, headers)
    case_study_id = make_case_study(client, headers, course_id)
    r = client.put(spec_url(course_id, case_study_id), json=SPEC, headers=headers)
    assert r.status_code == 200
    assert reader.calls == 0


def test_non_owner_is_403(client: TestClient) -> None:
    owner = professor(client)
    course_id = make_course(client, owner)
    case_study_id = make_case_study(client, owner, course_id)
    other = professor(client, email="other@example.edu")
    assert (
        client.put(spec_url(course_id, case_study_id), json=SPEC, headers=other)
        .status_code
        == 403
    )
    assert (
        client.get(spec_url(course_id, case_study_id), headers=other).status_code == 403
    )


def test_a_seat_is_refused(client: TestClient, storage: FakeStorage) -> None:
    headers = professor(client)
    course_id = make_course(client, headers)
    case_study_id = make_case_study(client, headers, course_id)
    token = seat_token(client, headers, course_id, storage)
    seat = {"Authorization": f"Bearer {token}"}
    assert (
        client.put(spec_url(course_id, case_study_id), json=SPEC, headers=seat)
        .status_code
        == 403
    )


def test_unauthenticated_is_401(client: TestClient) -> None:
    headers = professor(client)
    course_id = make_course(client, headers)
    case_study_id = make_case_study(client, headers, course_id)
    assert client.put(spec_url(course_id, case_study_id), json=SPEC).status_code == 401


def test_unknown_case_study_is_404(client: TestClient) -> None:
    headers = professor(client)
    course_id = make_course(client, headers)
    assert (
        client.put(spec_url(course_id, 999999), json=SPEC, headers=headers).status_code
        == 404
    )
