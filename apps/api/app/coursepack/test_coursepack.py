"""The course pack asset and its load (decision 0077).

Three properties carry this. The shipped pack is internally consistent and its
figure bytes are the bytes it claims, because a figure that drifted from the
professor's original is the one failure the figures-are-pixels constraint
exists to prevent. Loading is idempotent, because a pack revision must update
the case study a student's history and mastery evidence already point at rather
than create a second one beside it. And a loaded question is servable the
moment it lands: a seat reads it through the ordinary practice route with no
variant generation, no pool fill and no model call anywhere on the path.
"""

import hashlib
import json
import sqlite3
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.compression import decompress_text
from app.coursepack.loader import PACK_PROVENANCE, load_into_course, resolve_figure_tokens
from app.coursepack.schema import PACK_ROOT, CoursePack, figure_keys_in, load_pack
from app.db.connection import connect
from app.db.migrations import apply_migrations
from app.db.shards import COURSE_MIGRATIONS
from app.main import create_app
from app.storage import get_object_storage
from app.submissions.test_submissions import (
    SECRET,
    FakeObjectStorage,
    bearer,
    make_course,
    professor,
    seat_tokens,
)
from app.variants.solution import solution_markdown

PACK_ID = "bree-216"


@pytest.fixture(scope="module")
def pack() -> CoursePack:
    return load_pack(PACK_ID, 1)


# ------------------------------------------------------------------- the asset


def test_the_shipped_pack_parses_and_its_references_resolve(pack: CoursePack) -> None:
    """Parsing is the whole validation: CoursePack refuses duplicate keys, a
    question mapped to an unknown concept, and a body whose figure tokens and
    declared figures disagree."""
    assert pack.id == PACK_ID
    assert pack.questions, "a pack with no questions would load an empty course"
    assert pack.concepts


def test_every_figure_file_is_present_and_hashes_to_its_declared_sha256(
    pack: CoursePack,
) -> None:
    """The declared hash is the promise that these bytes are the ones the
    extractor pulled out of the professor's PDF. Verify it here as well as at
    load time, so a corrupted or re-encoded asset fails the suite rather than
    waiting to fail a deployment."""
    for figure in pack.figures:
        path = PACK_ROOT / pack.id / figure.file
        assert path.exists(), f"{figure.key}: {path} is missing"
        assert hashlib.sha256(path.read_bytes()).hexdigest() == figure.sha256, figure.key


def test_every_question_carries_a_worked_solution(pack: CoursePack) -> None:
    """A question without the professor's own working would leave the unfold
    with nothing to step and the tutor with no ground truth, which is the one
    thing a defence cannot be run without."""
    for question in pack.questions:
        assert question.solution_md.strip(), question.key
        assert question.body_md.strip(), question.key


def test_figure_tokens_only_name_declared_figures(pack: CoursePack) -> None:
    keys = {f.key for f in pack.figures}
    for question in pack.questions:
        for key in figure_keys_in(question.body_md) + figure_keys_in(question.solution_md):
            assert key in keys, f"{question.key} names undeclared figure {key}"


def test_resolving_tokens_rewrites_the_scheme_and_nothing_else() -> None:
    body = "before\n\n![alt](pack:a-cell)\n\n[a link](https://example.com) after"
    out = resolve_figure_tokens(body, {"a-cell": 42})
    assert "![alt](fig://42)" in out
    assert "https://example.com" in out
    assert "pack:" not in out


# --------------------------------------------------------------------- loading


@pytest.fixture()
def storage() -> FakeObjectStorage:
    return FakeObjectStorage()


@pytest.fixture()
def client(tmp_path: Path, storage: FakeObjectStorage) -> Iterator[TestClient]:
    app = create_app(data_dir=tmp_path, jwt_secret=SECRET)
    app.dependency_overrides[get_object_storage] = lambda: storage
    with TestClient(app) as c:
        yield c


def _load(
    tmp_path: Path, pack: CoursePack, storage: FakeObjectStorage, course_id: int
) -> sqlite3.Connection:
    conn = connect(tmp_path / "courses" / f"{course_id}.db")
    apply_migrations(conn, COURSE_MIGRATIONS)
    load_into_course(
        pack=pack,
        pack_root=PACK_ROOT / pack.id,
        conn=conn,
        storage=storage,
        course_id=course_id,
        author_id=1,
        now=1_780_000_000,
    )
    conn.commit()
    return conn


def test_load_publishes_a_case_study_and_a_servable_variant_per_question(
    tmp_path: Path, pack: CoursePack, storage: FakeObjectStorage
) -> None:
    conn = _load(tmp_path, pack, storage, course_id=1)
    try:
        cases = conn.execute(
            "SELECT COUNT(*) FROM case_studies WHERE status = 'published'"
        ).fetchone()[0]
        assert cases == len(pack.questions)
        # 'manual' is servable (variants.pool.SERVABLE_STATES) and is the honest
        # state: the professor wrote this, no model generated or verified it.
        states = {row[0] for row in conn.execute("SELECT DISTINCT verification FROM variants")}
        assert states == {"manual"}
        models = {row[0] for row in conn.execute("SELECT DISTINCT model_id FROM variants")}
        assert models == {PACK_PROVENANCE}
    finally:
        conn.close()


def test_a_loaded_solution_reads_back_through_the_shared_reader(
    tmp_path: Path, pack: CoursePack, storage: FakeObjectStorage
) -> None:
    """The unfold and the tutor both read a solution through
    variants.solution.solution_markdown, so a pack question must store in the
    shape they read, final answers included."""
    conn = _load(tmp_path, pack, storage, course_id=1)
    try:
        row = conn.execute(
            "SELECT v.solution_z FROM variants v JOIN course_pack_items i"
            " ON i.variant_id = v.id WHERE i.item_key = ?",
            (pack.questions[0].key,),
        ).fetchone()
        blob = decompress_text(conn, "problem_text", bytes(row[0]))
        assert solution_markdown(blob) == pack.questions[0].solution_md
        assert json.loads(blob)["final_answers"] == pack.questions[0].final_answers
    finally:
        conn.close()


def test_concept_mappings_land_with_their_weights(
    tmp_path: Path, pack: CoursePack, storage: FakeObjectStorage
) -> None:
    conn = _load(tmp_path, pack, storage, course_id=1)
    try:
        mapped = conn.execute("SELECT COUNT(*) FROM case_study_concepts").fetchone()[0]
        assert mapped == sum(len(q.concepts) for q in pack.questions)
        assert conn.execute("SELECT COUNT(*) FROM concepts").fetchone()[0] == len(pack.concepts)
    finally:
        conn.close()


def test_figures_are_stored_byte_for_byte_and_tokens_point_at_their_rows(
    tmp_path: Path, pack: CoursePack, storage: FakeObjectStorage
) -> None:
    """The bytes in object storage are the committed bytes, unaltered, and every
    fig:// token in a loaded body names a figures row that exists."""
    if not pack.figures:
        pytest.skip("this revision of the pack carries no figures")
    conn = _load(tmp_path, pack, storage, course_id=1)
    try:
        for figure in pack.figures:
            source = (PACK_ROOT / pack.id / figure.file).read_bytes()
            stored = next(
                data
                for (_, key), data in storage.objects.items()
                if key.endswith(f"{figure.sha256}{Path(figure.file).suffix}")
            )
            assert stored == source, figure.key

        ids = {int(r[0]) for r in conn.execute("SELECT id FROM figures")}
        for row in conn.execute("SELECT body_z FROM case_studies"):
            body = decompress_text(conn, "problem_text", bytes(row[0]))
            assert "pack:" not in body
            for token in body.split("fig://")[1:]:
                assert int(token.split(")")[0]) in ids
    finally:
        conn.close()


def test_reloading_updates_in_place_rather_than_duplicating(
    tmp_path: Path, pack: CoursePack, storage: FakeObjectStorage
) -> None:
    """The property the whole identity map exists for: a student's history and
    mastery evidence point at a case study id, so a pack revision must land on
    that row and not beside it."""
    conn = _load(tmp_path, pack, storage, course_id=1)
    try:
        first = {
            str(r[0]): int(r[1])
            for r in conn.execute("SELECT item_key, case_study_id FROM course_pack_items")
        }
        load_into_course(
            pack=pack,
            pack_root=PACK_ROOT / pack.id,
            conn=conn,
            storage=storage,
            course_id=1,
            author_id=1,
            now=1_780_000_099,
        )
        conn.commit()
        again = {
            str(r[0]): int(r[1])
            for r in conn.execute("SELECT item_key, case_study_id FROM course_pack_items")
        }
        assert first == again
        assert conn.execute("SELECT COUNT(*) FROM case_studies").fetchone()[0] == len(
            pack.questions
        )
        assert conn.execute("SELECT COUNT(*) FROM variants").fetchone()[0] == len(pack.questions)
    finally:
        conn.close()


def test_a_figure_whose_bytes_drifted_is_refused(
    tmp_path: Path, pack: CoursePack, storage: FakeObjectStorage
) -> None:
    """Mutation check on the promise above: if the committed bytes stop matching
    the declared hash, the load fails loudly rather than shipping a figure the
    professor did not draw."""
    if not pack.figures:
        pytest.skip("this revision of the pack carries no figures")
    fake_root = tmp_path / "pack"
    (fake_root / "figures").mkdir(parents=True)
    for figure in pack.figures:
        (fake_root / figure.file).write_bytes(b"not the professor's pixels")

    conn = connect(tmp_path / "courses" / "1.db")
    apply_migrations(conn, COURSE_MIGRATIONS)
    try:
        with pytest.raises(ValueError, match="hashes to"):
            load_into_course(
                pack=pack,
                pack_root=fake_root,
                conn=conn,
                storage=storage,
                course_id=1,
                author_id=1,
                now=1_780_000_000,
            )
    finally:
        conn.close()


# ------------------------------------------------------- servable end to end


def test_a_seat_practises_a_loaded_question_with_no_model_call(
    tmp_path: Path, pack: CoursePack, storage: FakeObjectStorage, client: TestClient
) -> None:
    """The point of the whole exercise: a student opens a pack question through
    the ordinary practice route and gets the professor's text back instantly.
    The pool is empty and stays empty, because a manual variant is servable."""
    headers = professor(client)
    course_id = make_course(client, headers)
    conn = _load(tmp_path, pack, storage, course_id)
    conn.close()

    token = seat_tokens(client, headers, course_id, storage)[0]
    # Walk the cursor rather than trusting one page: the list is paginated at
    # 50 by default and the pack passed that with L6, so a single-page
    # assertion silently became a test of the page size rather than of the
    # load. Paging it also exercises the seat's own read of a course this big.
    items: list[dict[str, object]] = []
    cursor: int | None = None
    while True:
        query = f"?limit=100&cursor={cursor}" if cursor is not None else "?limit=100"
        listed = client.get(
            f"/api/v1/courses/{course_id}/case-studies{query}", headers=bearer(token)
        )
        assert listed.status_code == 200, listed.text
        body = listed.json()
        items.extend(body["items"])
        cursor = body["next_cursor"]
        if cursor is None:
            break
    assert len(items) == len(pack.questions)

    first = items[0]["id"]
    served = client.get(
        f"/api/v1/courses/{course_id}/case-studies/{first}/practice-variant",
        headers=bearer(token),
    )
    assert served.status_code == 200, served.text
    payload = served.json()
    assert payload["variant_id"] is not None, "a manual variant must be servable"
    assert payload["body"].strip()
    assert "solution" not in payload


def test_a_seat_resolves_a_pack_figure_its_published_question_carries(
    tmp_path: Path, pack: CoursePack, storage: FakeObjectStorage, client: TestClient
) -> None:
    """The figure resolve's seat rule is "a figure a published case study
    carries". A pack figure satisfies it through `case_study_figures` rather
    than the import chain, and before migration 0023 it satisfied it by no
    route at all, so the student's diagram was a 404 on the page."""
    if not pack.figures:
        pytest.skip("this revision of the pack carries no figures")
    headers = professor(client)
    course_id = make_course(client, headers)
    conn = _load(tmp_path, pack, storage, course_id)
    with_figure = conn.execute(
        "SELECT case_study_id, figure_id FROM case_study_figures LIMIT 1"
    ).fetchone()
    conn.close()
    case_study_id, figure_id = int(with_figure[0]), int(with_figure[1])

    token = seat_tokens(client, headers, course_id, storage)[0]
    resolved = client.get(f"/api/v1/courses/{course_id}/figures/{figure_id}", headers=bearer(token))
    assert resolved.status_code == 200, resolved.text
    assert resolved.json()["image_url"]

    # And the body the seat reads points at exactly that figure.
    served = client.get(
        f"/api/v1/courses/{course_id}/case-studies/{case_study_id}/practice-variant",
        headers=bearer(token),
    )
    assert f"fig://{figure_id}" in served.json()["body"]


def test_an_unpublished_pack_figure_stays_a_404_to_a_seat(
    tmp_path: Path, pack: CoursePack, storage: FakeObjectStorage, client: TestClient
) -> None:
    """Mutation check on the rule the UNION arm had to preserve: widening the
    ways a figure can be reached must not widen what a seat can see."""
    if not pack.figures:
        pytest.skip("this revision of the pack carries no figures")
    headers = professor(client)
    course_id = make_course(client, headers)
    conn = _load(tmp_path, pack, storage, course_id)
    row = conn.execute("SELECT case_study_id, figure_id FROM case_study_figures LIMIT 1").fetchone()
    case_study_id, figure_id = int(row[0]), int(row[1])
    conn.execute("UPDATE case_studies SET status = 'draft' WHERE id = ?", (case_study_id,))
    conn.commit()
    conn.close()

    token = seat_tokens(client, headers, course_id, storage)[0]
    refused = client.get(f"/api/v1/courses/{course_id}/figures/{figure_id}", headers=bearer(token))
    assert refused.status_code == 404, refused.text
    # The professor who owns the course still resolves it, draft or not.
    allowed = client.get(f"/api/v1/courses/{course_id}/figures/{figure_id}", headers=headers)
    assert allowed.status_code == 200, allowed.text


def test_pack_figures_reach_the_tutor_and_the_frozen_check(
    tmp_path: Path, pack: CoursePack, storage: FakeObjectStorage
) -> None:
    """`load_essential_figures` is the one lookup the defence context and the
    figure-frozen check share, so a figure missing from it is a figure the
    tutor is never shown."""
    if not pack.figures:
        pytest.skip("this revision of the pack carries no figures")
    from app.params.figure_check import load_essential_figures

    conn = _load(tmp_path, pack, storage, course_id=1)
    try:
        row = conn.execute(
            "SELECT case_study_id, figure_id FROM case_study_figures LIMIT 1"
        ).fetchone()
        found = load_essential_figures(int(row[0]))(conn)
        assert [f.figure_id for f in found] == [int(row[1])]
    finally:
        conn.close()


def test_a_shortlisted_sku_absent_from_the_catalogue_is_refused() -> None:
    """Mutation check on the shortlist validation (decision 0081): a SKU that is
    not in the pinned catalogue would load as a link to nothing, so the pack
    refuses to parse rather than shipping it."""
    raw = json.loads((PACK_ROOT / PACK_ID / "v1.json").read_text(encoding="utf-8"))
    raw["questions"][0]["shortlist"] = ["NOT-A-REAL-SKU"]
    with pytest.raises(ValueError, match="absent from"):
        CoursePack.model_validate(raw)


def test_shortlists_load_in_the_order_the_pack_sets(
    tmp_path: Path, pack: CoursePack, storage: FakeObjectStorage
) -> None:
    """Order is meaning on a shortlist: the first line is the one the student
    meets first, so the pack's order has to be the shard's order."""
    shortlisted = [q for q in pack.questions if q.shortlist]
    if not shortlisted:
        pytest.skip("this revision of the pack shortlists nothing")
    conn = _load(tmp_path, pack, storage, course_id=1)
    try:
        for question in shortlisted:
            rows = conn.execute(
                "SELECT s.sku FROM case_study_shortlist s JOIN course_pack_items i"
                " ON i.case_study_id = s.case_study_id"
                " WHERE i.item_key = ? ORDER BY s.position",
                (question.key,),
            ).fetchall()
            assert [str(r[0]) for r in rows] == question.shortlist, question.key
        # And a question with no shortlist gets no rows, which is what makes the
        # problem view withhold the marketplace link.
        total = conn.execute(
            "SELECT COUNT(DISTINCT case_study_id) FROM case_study_shortlist"
        ).fetchone()[0]
        assert total == len(shortlisted)
    finally:
        conn.close()
