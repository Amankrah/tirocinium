"""The seeder is code, so it is tested like code (milestone 3.5 part B,
decision 0064).

These tests are the contract the frontend's journeys depend on. Every one of
them exists because a browser test that finds the wrong state fails in a way
that reads as a product bug: a sign-in that will not take, a variant that is
never served, a reading that does not join to its page. Checking the
invariants here means the seeder is exercised on every run of the Python
suite, including on the machines where nobody runs a browser at all.
"""

import hashlib
import io
import json
import sqlite3
from contextlib import redirect_stdout
from pathlib import Path
from typing import Any

import pytest

from app.auth.passwords import verify_password
from app.compression import decompress_text
from app.db.connection import connect
from app.seats.codes import normalize_code, verify_code
from app.storage import IMPORTS_BUCKET, SCANS_BUCKET
from scripts.seed_e2e import (
    COURSE_ID,
    PRACTICE_CASE_ID,
    PRO_EMAIL,
    SeedOutput,
    main,
    seed,
    upload_fixture_png,
)


class FakeObjectStorage:
    """In-memory stand-in satisfying app.storage.ObjectStorage."""

    def __init__(self) -> None:
        self.objects: dict[tuple[str, str], bytes] = {}

    def create_bucket(self, *, Bucket: str) -> object:
        return {}

    def put_object(self, *, Bucket: str, Key: str, Body: Any) -> object:
        data = Body.read() if hasattr(Body, "read") else bytes(Body)
        self.objects[(Bucket, Key)] = data
        return {}

    def get_object(self, *, Bucket: str, Key: str) -> Any:
        return {"Body": io.BytesIO(self.objects[(Bucket, Key)])}

    def generate_presigned_url(
        self, ClientMethod: str, Params: dict[str, str], ExpiresIn: int
    ) -> str:
        return f"https://storage.test/{Params['Bucket']}/{Params['Key']}"


@pytest.fixture
def storage() -> FakeObjectStorage:
    return FakeObjectStorage()


@pytest.fixture
def seeded(tmp_path: Path, storage: FakeObjectStorage) -> SeedOutput:
    return seed(tmp_path, storage)


def directory(data_dir: Path) -> sqlite3.Connection:
    return connect(data_dir / "directory.db")


def shard(data_dir: Path) -> sqlite3.Connection:
    return connect(data_dir / "courses" / f"{COURSE_ID}.db")


# ----------------------------------------------------- the sign-in half


def test_the_printed_password_verifies_against_the_stored_hash(
    tmp_path: Path, seeded: SeedOutput
) -> None:
    """Journey one signs in through the UI, so the hash has to be a real
    Argon2id hash of the plaintext the seeder printed, not a dummy."""
    row = directory(tmp_path).execute(
        "SELECT password_hash, role FROM users WHERE email = ?", (seeded.pro_email,)
    ).fetchone()
    assert row is not None
    assert verify_password(row[0], seeded.pro_password)
    assert row[1] == "professor"


def test_the_seeded_email_survives_the_api_boundary(seeded: SeedOutput) -> None:
    """LoginIn types its email as EmailStr, which refuses special-use TLDs. A
    seeded `.test` address writes into the shard without complaint and then
    returns 422 from the login route, so every professor journey fails at the
    first step for a reason no browser test could explain. Found exactly that
    way; this is the check that would have caught it in the suite."""
    from pydantic import EmailStr, TypeAdapter

    assert TypeAdapter(EmailStr).validate_python(seeded.pro_email) == seeded.pro_email


def test_the_course_is_owned_by_the_seeded_professor(
    tmp_path: Path, seeded: SeedOutput
) -> None:
    row = directory(tmp_path).execute(
        "SELECT c.title, c.owner_id, u.email FROM courses c JOIN users u ON u.id = c.owner_id"
        " WHERE c.id = ?",
        (seeded.course_id,),
    ).fetchone()
    assert row is not None
    assert row[0] == seeded.course_title
    assert row[2] == seeded.pro_email


def test_exactly_one_active_seat_whose_printed_code_is_accepted(
    tmp_path: Path, seeded: SeedOutput
) -> None:
    """The seat half of every student journey. The code is printed formatted,
    so it also has to survive the normalisation the redemption route applies."""
    rows = directory(tmp_path).execute(
        "SELECT seat_number, code_hash, status FROM seats WHERE course_id = ?",
        (seeded.course_id,),
    ).fetchall()
    assert len(rows) == 1
    seat_number, code_hash, status = rows[0]
    assert seat_number == "S-001"
    assert status == "active"
    assert verify_code(code_hash, normalize_code(seeded.seat_code))


def test_a_wrong_code_is_not_accepted(tmp_path: Path, seeded: SeedOutput) -> None:
    """The mirror of the test above: it would pass against a verify_code that
    said yes to everything, which is exactly the failure it has to exclude."""
    row = directory(tmp_path).execute(
        "SELECT code_hash FROM seats WHERE course_id = ?", (seeded.course_id,)
    ).fetchone()
    assert not verify_code(row[0], normalize_code("2222-3333-4444-5555"))


# ------------------------------------------------------- the course content


def test_the_practice_case_study_is_published_with_a_servable_variant(
    tmp_path: Path, seeded: SeedOutput
) -> None:
    """A seat reads published content only, and the practice read serves a
    variant that is neither flagged nor a solution."""
    conn = shard(tmp_path)
    status = conn.execute(
        "SELECT status FROM case_studies WHERE id = ?", (seeded.case_study_id,)
    ).fetchone()[0]
    assert status == "published"
    verification, case_study_id = conn.execute(
        "SELECT verification, case_study_id FROM variants WHERE id = ?",
        (seeded.variant_id,),
    ).fetchone()
    assert verification == "verified"
    assert case_study_id == seeded.case_study_id


def test_the_flagged_case_study_carries_flagged_variants_with_both_solutions(
    tmp_path: Path, seeded: SeedOutput
) -> None:
    """Journey six compares the generation against the independent re-solve and
    promotes one, so there must be more than one flagged row and each must
    carry the re-solve and the honest reason it was withheld."""
    rows = shard(tmp_path).execute(
        "SELECT verify_solution_z, flag_reason FROM variants"
        " WHERE case_study_id = ? AND verification = 'flagged'",
        (seeded.flagged_case_study_id,),
    ).fetchall()
    assert len(rows) >= 2
    for verify_solution_z, flag_reason in rows:
        assert verify_solution_z is not None
        assert flag_reason


def test_no_flagged_variant_belongs_to_the_practice_case_study(
    tmp_path: Path, seeded: SeedOutput
) -> None:
    """The inviolable half of the pool rule: a flagged variant is never served,
    so the case study a seat practises must have none."""
    flagged = shard(tmp_path).execute(
        "SELECT COUNT(*) FROM variants WHERE case_study_id = ? AND verification = 'flagged'",
        (seeded.case_study_id,),
    ).fetchone()[0]
    assert flagged == 0


def test_bodies_are_compressed_at_rest(tmp_path: Path, seeded: SeedOutput) -> None:
    """Seeded rows go through the same codec as written ones; a plaintext body
    would read fine in a browser and be wrong in the shard."""
    conn = shard(tmp_path)
    blob = conn.execute(
        "SELECT body_z FROM case_studies WHERE id = ?", (seeded.case_study_id,)
    ).fetchone()[0]
    assert not blob.startswith(b"# ")
    assert "Pump sizing" in decompress_text(conn, "problem_text", blob)


# ----------------------------------------------------- the seeded submission


def test_the_submission_is_processed_and_its_pages_join_to_their_reading(
    tmp_path: Path, seeded: SeedOutput
) -> None:
    """The join the review surface and the defence context both make. It is by
    content_sha, and getting it wrong leaves a submission that looks processed
    and reads as empty."""
    conn = shard(tmp_path)
    status, conf = conn.execute(
        "SELECT status, recognition_conf FROM submissions WHERE id = ?",
        (seeded.defence_submission_id,),
    ).fetchone()
    assert status == "processed"
    assert conf is not None
    joined = conn.execute(
        "SELECT pt.confidence, pt.regions_json FROM submission_pages sp"
        " JOIN page_transcriptions pt ON sp.content_sha = pt.content_hash"
        " WHERE sp.submission_id = ?",
        (seeded.defence_submission_id,),
    ).fetchall()
    assert len(joined) == 1
    assert json.loads(joined[0][1])


def test_the_submission_belongs_to_the_seeded_seat_and_variant(
    tmp_path: Path, seeded: SeedOutput
) -> None:
    """The defence opens a seat's own submission; a submission filed against
    another seat is a 404 there, which would read as a broken route."""
    seat_id, variant_id = shard(tmp_path).execute(
        "SELECT seat_id, variant_id FROM submissions WHERE id = ?",
        (seeded.defence_submission_id,),
    ).fetchone()
    assert variant_id == seeded.variant_id
    directory_seat = directory(tmp_path).execute(
        "SELECT course_id FROM seats WHERE id = ?", (seat_id,)
    ).fetchone()
    assert directory_seat[0] == seeded.course_id


def test_the_renditions_the_model_read_are_in_storage(
    tmp_path: Path, seeded: SeedOutput, storage: FakeObjectStorage
) -> None:
    """The review surface draws its region boxes on the grayscale rendition and
    offers the original beside it, so both have to exist as real decodable
    images, not as keys pointing at nothing."""
    conn = shard(tmp_path)
    original, grayscale, binarized = conn.execute(
        "SELECT storage_key, grayscale_key, binarized_key FROM submission_pages"
        " WHERE submission_id = ? AND page_index = 0",
        (seeded.defence_submission_id,),
    ).fetchone()
    for key in (original, grayscale, binarized):
        assert (SCANS_BUCKET, key) in storage.objects
        assert storage.objects[(SCANS_BUCKET, key)].startswith(b"\x89PNG")


def test_the_seeded_renditions_are_what_preprocess_produces(
    tmp_path: Path, seeded: SeedOutput, storage: FakeObjectStorage
) -> None:
    """The renditions are not a second image written by hand: they are the
    output of the real crate over the seeded original, so the professor is
    reviewing exactly what the pipeline would have put there."""
    from platform_core import preprocess as pp

    conn = shard(tmp_path)
    original_key, grayscale_key = conn.execute(
        "SELECT storage_key, grayscale_key FROM submission_pages"
        " WHERE submission_id = ? AND page_index = 0",
        (seeded.defence_submission_id,),
    ).fetchone()
    original = storage.objects[(SCANS_BUCKET, original_key)]
    grayscale, _binarized, _metrics = pp.preprocess(original)
    assert storage.objects[(SCANS_BUCKET, grayscale_key)] == grayscale
    # And the cache key is the server's hash of the original, never a declared one.
    content_sha = conn.execute(
        "SELECT content_sha FROM submission_pages WHERE submission_id = ?",
        (seeded.defence_submission_id,),
    ).fetchone()[0]
    assert content_sha == hashlib.sha256(original).hexdigest()


# ---------------------------------------------------------- the seeded import


def test_the_import_is_ready_with_two_pending_items_carrying_figures(
    tmp_path: Path, seeded: SeedOutput
) -> None:
    """Journey four merges the second item into the first and confirms the
    survivor, so two pending items is the minimum that exercises it."""
    conn = shard(tmp_path)
    status, page_count = conn.execute(
        "SELECT status, page_count FROM import_jobs WHERE id = ?", (seeded.import_id,)
    ).fetchone()
    assert status == "ready"
    assert page_count == 2
    items = conn.execute(
        "SELECT id, question_z, state FROM import_items WHERE job_id = ?",
        (seeded.import_id,),
    ).fetchall()
    assert len(items) == 2
    for item_id, question_z, state in items:
        assert state == "pending"
        linked = conn.execute(
            "SELECT figure_id FROM item_figures WHERE item_id = ?", (item_id,)
        ).fetchall()
        assert len(linked) == 1
        # The token in the text names the figure that is actually linked, which
        # is what makes the figure render at its position in the draft.
        question = decompress_text(conn, "problem_text", question_z)
        assert f"fig://{linked[0][0]}" in question


def test_every_seeded_figure_and_source_page_has_its_bytes(
    tmp_path: Path, seeded: SeedOutput, storage: FakeObjectStorage
) -> None:
    """The confirmation surface draws boxes on the source page and renders the
    crop inline; both are presigned reads straight from storage."""
    conn = shard(tmp_path)
    for (key,) in conn.execute(
        "SELECT image_key FROM import_pages WHERE job_id = ?", (seeded.import_id,)
    ).fetchall():
        assert (IMPORTS_BUCKET, key) in storage.objects
    for (key,) in conn.execute("SELECT storage_key FROM figures").fetchall():
        assert storage.objects[(IMPORTS_BUCKET, key)].startswith(b"\x89PNG")


def test_figure_bboxes_are_normalised(tmp_path: Path, seeded: SeedOutput) -> None:
    """Decision 0032: a bbox is 0..1 of its page, so a client needs no page
    dimensions. A pixel bbox would place every box off-screen."""
    for (bbox,) in shard(tmp_path).execute("SELECT bbox FROM figures").fetchall():
        values = json.loads(bbox)
        assert len(values) == 4
        assert all(0.0 <= value <= 1.0 for value in values)


# ------------------------------------------------- the recorded model responses


def test_the_recorded_reading_is_keyed_by_the_real_preprocess_rendition(
    tmp_path: Path, seeded: SeedOutput
) -> None:
    """The load-bearing one. RecordedTranscriber keys on the sha256 of the
    grayscale rendition, so the seeder's key has to be the rendition of the
    page the journey actually uploads. If this drifts, journey two either
    errors or, worse, reaches a live provider."""
    from platform_core import preprocess as pp

    from app.transcription.model import RecordedTranscriber

    grayscale, _binarized, _metrics = pp.preprocess(upload_fixture_png())
    key = hashlib.sha256(grayscale).hexdigest()
    recorded = tmp_path / "e2e-recorded" / "transcription" / f"{key}.json"
    assert recorded.is_file()
    # And it loads through the seam that will replay it, not merely as JSON.
    transcriber = RecordedTranscriber.from_dir(recorded.parent)
    assert key in transcriber._responses


def test_the_upload_fixture_matches_the_frontend_checkerboard(
    seeded: SeedOutput,
) -> None:
    """The two sides share a pixel specification rather than a binary, so the
    specification is asserted here: 96 by 96, 8-bit grayscale, alternating
    black and white by (x + y) parity, exactly apps/web/e2e/fixtures.ts."""
    png = upload_fixture_png()
    assert png.startswith(b"\x89PNG")
    assert png[16:24] == (96).to_bytes(4, "big") + (96).to_bytes(4, "big")
    assert png[24] == 8 and png[25] == 0


def test_the_upload_fixture_is_not_rejected_by_preprocess(seeded: SeedOutput) -> None:
    """A page the crate rejects would send journey two to needs_retake, which
    is a real outcome the surface handles and not the one it is testing."""
    from platform_core import preprocess as pp

    grayscale, binarized, metrics = pp.preprocess(upload_fixture_png())
    assert grayscale.startswith(b"\x89PNG")
    assert binarized.startswith(b"\x89PNG")
    assert json.loads(metrics)["width"] == 96


def test_the_defence_script_is_loadable_and_never_reveals(
    tmp_path: Path, seeded: SeedOutput
) -> None:
    """The tutor's hard rule is not suspended for a fixture. A scripted reply
    carrying the reference answer would sit in the repository as an example of
    the one thing the tutor must never do."""
    from app.defense.model import RecordedTutor

    tutor = RecordedTutor.from_dir(tmp_path / "e2e-recorded" / "defense")
    assert tutor._replies
    assert tutor._rubrics
    for reply in tutor._replies:
        assert "9443" not in reply
        assert "6799" not in reply
    for rubric in tutor._rubrics:
        assert json.loads(rubric)["concepts"]


# --------------------------------------------------------- the output contract


def test_the_output_carries_exactly_the_documented_keys(seeded: SeedOutput) -> None:
    """The frontend maps these to E2E_* names; an added or renamed key is a
    silent skip in CI, which is the failure this whole milestone is about."""
    assert set(seeded.model_dump()) == {
        "pro_email",
        "pro_password",
        "course_title",
        "course_id",
        "seat_code",
        "case_study_id",
        "variant_id",
        "flagged_case_study_id",
        "import_id",
        "defence_submission_id",
    }


def test_the_output_carries_nothing_about_a_student(seeded: SeedOutput) -> None:
    """Students are seats. The seat code is a credential and the seat number is
    the only identifier the product has; there is no name or email to leak, and
    this asserts none appeared."""
    payload = seeded.model_dump_json().lower()
    for forbidden in ("student", "name", "@student", "s-001"):
        assert forbidden not in payload


def test_main_prints_exactly_one_json_line(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, storage: FakeObjectStorage
) -> None:
    """The CI step parses stdout directly, so a stray print anywhere in the
    import graph would break the job in a way no unit test would catch."""
    monkeypatch.setenv("TIRO_DATA_DIR", str(tmp_path))
    monkeypatch.setattr("app.storage.get_object_storage", lambda: storage)

    buffer = io.StringIO()
    with redirect_stdout(buffer):
        assert main([]) == 0

    lines = buffer.getvalue().strip().splitlines()
    assert len(lines) == 1
    SeedOutput.model_validate_json(lines[0])


def test_reseeding_refuses_unless_reset_is_passed(
    tmp_path: Path, storage: FakeObjectStorage
) -> None:
    """The guard that keeps the seeder from quietly mutating a data directory
    that already holds something."""
    seed(tmp_path, storage)
    with pytest.raises(SystemExit) as refused:
        seed(tmp_path, storage)
    assert PRO_EMAIL in str(refused.value)

    again = seed(tmp_path, storage, reset=True)
    assert again.case_study_id == PRACTICE_CASE_ID
