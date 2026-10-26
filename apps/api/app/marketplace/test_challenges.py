"""Project challenges, the selection matrix and committed selections
(decision 0112).

What these hold to account. A challenge shows a student the requirements and
never the answer: no family, no shortlist, until a selection is committed,
and then the author's shortlist is a reveal with the agreement reported and
not graded. The matrix is scored on the server from the comparison's own
figures, the best candidate under a weighting reads 100, and a missing figure
is named rather than hidden. A selection is stored as one artifact (candidates,
weights, scored matrix, priced basket), recommitting replaces the work and
keeps the first commit's time, a submission may cite it on ownership alone,
and the defence context carries it as a fifth delimited source. A professor's
challenge is course content: drafts are invisible to seats, an unknown
shortlist SKU is refused, and a challenge with selections cannot be deleted.
"""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.defense.context import context_document
from app.marketplace.catalogue import available_catalogues, load_catalogue
from app.marketplace.challenges import (
    SelectionIn,
    StoredSelection,
    brief_challenge,
    commit_selection,
    render_selection,
)
from app.marketplace.listing import list_prices
from app.marketplace.matrix import CRITERION_KEYS, Weights, score_matrix
from app.marketplace.quoting import QuoteLineIn
from app.marketplace.test_marketplace import PLATE, STAINLESS, World, build
from app.security.test_prompt_injection import blocks, outside_the_fences
from app.submissions.test_submissions import FakeObjectStorage, bearer

NEWEST = max(version for cid, version in available_catalogues() if cid == "bree-216")
CATALOGUE = load_catalogue("bree-216", NEWEST)
PRICES = list_prices(CATALOGUE)
ALUMINIUM = "LMS-6061-PL06"
BRIEF = CATALOGUE.briefs[0]
BRIEF_KEY = f"brief:{CATALOGUE.id}:{BRIEF.id}"

WEIGHTS = {"cost": 4, "toughness": 5, "corrosion": 2}
SELECTION = {
    "candidates": [PLATE, STAINLESS, ALUMINIUM],
    "weights": WEIGHTS,
    "lines": [{"sku": PLATE, "quantity": 40}],
}


def unpinned(client: TestClient, storage: FakeObjectStorage, tmp_data: Path, **kw: object) -> World:
    """A seat whose course pins no catalogue meets the newest shipped one,
    which is where the requirements statements live."""
    return build(client, storage, tmp_data, pin=False, **kw)  # type: ignore[arg-type]


# -------------------------------------------------------------- the matrix


def test_the_best_candidate_under_a_weighting_reads_100_and_the_rest_follow() -> None:
    matrix = score_matrix(CATALOGUE, PRICES, [PLATE, STAINLESS], Weights(values={"cost": 5}))
    by_sku = {score.sku: score for score in matrix.scores}
    # A36 is the cheaper per kilogram, so under cost alone it is the whole score.
    assert by_sku[PLATE].score == 100.0 and by_sku[PLATE].rank == 1
    assert by_sku[STAINLESS].score == 0.0 and by_sku[STAINLESS].rank == 2
    assert [c.key for c in matrix.criteria] == ["cost"]
    assert matrix.weights == {"cost": 5}


def test_a_weighted_sum_is_a_percentage_of_the_best_possible() -> None:
    matrix = score_matrix(CATALOGUE, PRICES, [PLATE, STAINLESS, ALUMINIUM], Weights(values=WEIGHTS))
    assert all(0.0 <= score.score <= 100.0 for score in matrix.scores)
    assert sorted(score.rank for score in matrix.scores) == [1, 2, 3]
    cost = next(c for c in matrix.criteria if c.key == "cost")
    assert cost.better == "lower"
    # The displayed figure is the comparison's own rendering, never a bare float.
    assert all(cell.display for cell in cost.cells)


def test_a_missing_figure_scores_nothing_and_is_named() -> None:
    # A shop hour has no fracture toughness. Scored as 0 on that criterion, and
    # the gap is reported rather than averaged away.
    service = next(line.sku for line in CATALOGUE.lines if line.service)
    matrix = score_matrix(
        CATALOGUE, PRICES, [PLATE, service], Weights(values={"toughness": 3, "cost": 1})
    )
    gap = next(score for score in matrix.scores if score.sku == service)
    assert "toughness" in gap.missing


@pytest.mark.parametrize(
    ("skus", "weights", "reason"),
    [
        ([PLATE, STAINLESS], {"wear": 3}, "not a matrix criterion"),
        ([PLATE, STAINLESS], {"cost": 0}, "weighs nothing"),
        ([PLATE, STAINLESS], {"cost": 9}, "0 to 5"),
        ([PLATE, "NOPE-1"], {"cost": 3}, "at least 2"),
    ],
)
def test_a_matrix_refuses_what_it_cannot_score(
    skus: list[str], weights: dict[str, int], reason: str
) -> None:
    with pytest.raises(ValueError, match=reason):
        score_matrix(CATALOGUE, PRICES, skus, Weights(values=weights))


def test_the_matrix_endpoint_scores_at_list_prices_and_stores_nothing(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    world = unpinned(client, storage, tmp_data)
    r = client.post(
        "/api/v1/marketplace/matrix",
        json={"skus": [PLATE, STAINLESS], "weights": {"cost": 5}},
        headers=bearer(world.token),
    )
    assert r.status_code == 200, r.text
    assert {s["sku"]: s["score"] for s in r.json()["scores"]} == {PLATE: 100.0, STAINLESS: 0.0}
    bad = client.post(
        "/api/v1/marketplace/matrix",
        json={"skus": [PLATE, STAINLESS], "weights": {"wear": 5}},
        headers=bearer(world.token),
    )
    assert bad.status_code == 400
    assert (
        client.post("/api/v1/marketplace/matrix", json={"skus": [], "weights": {}}).status_code
        == 401
    )


# ---------------------------------------------------------- the challenge


def test_a_brief_reads_as_requirements_and_withholds_the_answer() -> None:
    definition = brief_challenge(CATALOGUE, BRIEF)
    assert definition.key == BRIEF_KEY
    assert definition.requirements and definition.context
    assert definition.weights and set(definition.weights) <= set(CRITERION_KEYS)
    # Every weight the author suggests names a criterion the matrix can score.
    for brief in CATALOGUE.briefs:
        assert set(brief.weights) <= set(CRITERION_KEYS), brief.id
        assert brief.requirements, brief.id


def test_a_brief_from_before_the_requirements_falls_back_to_its_factors() -> None:
    old = load_catalogue("bree-216", 1)
    definition = brief_challenge(old, old.briefs[0])
    assert [r.text for r in definition.requirements] == old.briefs[0].selection_factors
    assert definition.deliverable


def test_the_list_and_the_detail_show_no_shortlist_before_a_commit(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    world = unpinned(client, storage, tmp_data)
    listed = client.get("/api/v1/marketplace/challenges", headers=bearer(world.token))
    assert listed.status_code == 200, listed.text
    entries = listed.json()
    assert len(entries) == len(CATALOGUE.briefs)
    assert all(entry["source"] == "catalogue" and not entry["committed"] for entry in entries)
    assert "shortlist" not in entries[0] and "candidate_families" not in entries[0]

    detail = client.get(f"/api/v1/marketplace/challenges/{BRIEF_KEY}", headers=bearer(world.token))
    assert detail.status_code == 200, detail.text
    body = detail.json()
    assert body["title"] == BRIEF.title
    assert len(body["requirements"]) == len(BRIEF.requirements)
    assert body["selection"] is None and body["reveal"] is None
    assert [c["key"] for c in body["criteria"]] == list(CRITERION_KEYS)
    # Nothing on the wire names a line the author would have chosen.
    for sku in BRIEF.shortlist:
        assert sku not in detail.text
    assert (
        client.get(
            "/api/v1/marketplace/challenges/brief:x:y", headers=bearer(world.token)
        ).status_code
        == 404
    )


def test_committing_a_selection_earns_the_reveal_and_stores_one_artifact(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    world = unpinned(client, storage, tmp_data)
    r = client.post(
        f"/api/v1/marketplace/challenges/{BRIEF_KEY}/selection",
        json=SELECTION,
        headers=bearer(world.token),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    selection = body["selection"]
    assert selection["candidates"] == SELECTION["candidates"]
    assert selection["weights"] == WEIGHTS
    assert selection["matrix"]["scores"] and selection["lines"][0]["sku"] == PLATE
    assert selection["totals"]["total_cents"] > 0
    assert selection["reference"].startswith("BREE-SEL-")
    reveal = body["reveal"]
    assert reveal["candidate_families"] == BRIEF.candidate_families
    assert [line["sku"] for line in reveal["shortlist"]] == [
        sku for sku in BRIEF.shortlist if CATALOGUE.line(sku)
    ]
    assert set(reveal["agreement"]) == set(SELECTION["candidates"]) & set(BRIEF.shortlist)

    again = client.get(f"/api/v1/marketplace/challenges/{BRIEF_KEY}", headers=bearer(world.token))
    assert again.json()["selection"]["reference"] == selection["reference"]
    assert again.json()["reveal"] is not None
    listed = client.get("/api/v1/marketplace/challenges", headers=bearer(world.token)).json()
    mine = next(entry for entry in listed if entry["key"] == BRIEF_KEY)
    assert mine["committed"] and mine["reference"] == selection["reference"]


def test_recommitting_replaces_the_work_and_keeps_the_first_commit(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    world = unpinned(client, storage, tmp_data)
    first = client.post(
        f"/api/v1/marketplace/challenges/{BRIEF_KEY}/selection",
        json=SELECTION,
        headers=bearer(world.token),
    ).json()["selection"]
    second = client.post(
        f"/api/v1/marketplace/challenges/{BRIEF_KEY}/selection",
        json={**SELECTION, "weights": {"corrosion": 5}},
        headers=bearer(world.token),
    ).json()["selection"]
    assert second["id"] == first["id"]
    assert second["weights"] == {"corrosion": 5}
    assert second["first_committed_at"] == first["first_committed_at"]
    assert second["committed_at"] >= first["committed_at"]


def test_a_selection_that_cannot_be_scored_or_priced_is_refused(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    world = unpinned(client, storage, tmp_data)
    url = f"/api/v1/marketplace/challenges/{BRIEF_KEY}/selection"
    assert (
        client.post(url, json={**SELECTION, "weights": {}}, headers=bearer(world.token)).status_code
        == 400
    )
    assert (
        client.post(
            url,
            json={**SELECTION, "lines": [{"sku": "NOPE-1", "quantity": 1}]},
            headers=bearer(world.token),
        ).status_code
        == 400
    )
    assert (
        client.post(
            url, json={**SELECTION, "candidates": [PLATE]}, headers=bearer(world.token)
        ).status_code
        == 422
    )
    assert client.post(url, json=SELECTION, headers=world.headers).status_code == 403


def test_two_seats_hold_their_own_selections(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    world = unpinned(client, storage, tmp_data, seats=2)
    first, second = world.tokens
    client.post(
        f"/api/v1/marketplace/challenges/{BRIEF_KEY}/selection",
        json=SELECTION,
        headers=bearer(first),
    )
    other = client.get(f"/api/v1/marketplace/challenges/{BRIEF_KEY}", headers=bearer(second)).json()
    assert other["selection"] is None and other["reveal"] is None


# ----------------------------------------------------- the professor's own

CHALLENGE = {
    "title": "A feed auger for a dairy barn",
    "context": "A 6 m screw auger moving silage in a damp barn.",
    "requirements": [
        {"text": "Resist silage effluent", "target": "pH 4"},
        {"text": "Carry the torque without yielding", "target": ""},
    ],
    "constraints": ["Batch of 20"],
    "deliverable": "",
    "weights": {"corrosion": 5, "cost": 3},
    "candidate_families": "Galvanised steel vs. stainless vs. polymer-lined steel",
    "shortlist": [PLATE, STAINLESS],
    "status": "draft",
}


def test_a_professor_authors_a_challenge_and_a_seat_sees_it_only_once_published(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    world = unpinned(client, storage, tmp_data)
    base = f"/api/v1/courses/{world.course_id}/challenges"
    created = client.post(base, json=CHALLENGE, headers=world.headers)
    assert created.status_code == 201, created.text
    challenge = created.json()
    assert challenge["status"] == "draft" and challenge["selection_count"] == 0
    key = challenge["key"]

    listed = client.get("/api/v1/marketplace/challenges", headers=bearer(world.token)).json()
    assert key not in {entry["key"] for entry in listed}
    assert (
        client.get(f"/api/v1/marketplace/challenges/{key}", headers=bearer(world.token)).status_code
        == 404
    )

    published = client.put(
        f"{base}/{challenge['id']}",
        json={**CHALLENGE, "status": "published"},
        headers=world.headers,
    )
    assert published.status_code == 200, published.text
    listed = client.get("/api/v1/marketplace/challenges", headers=bearer(world.token)).json()
    mine = next(entry for entry in listed if entry["key"] == key)
    assert mine["source"] == "course" and mine["requirement_count"] == 2
    detail = client.get(f"/api/v1/marketplace/challenges/{key}", headers=bearer(world.token)).json()
    assert detail["weights"] == {"corrosion": 5, "cost": 3}
    assert detail["deliverable"]  # the standard deliverable when the author left it blank
    assert (
        STAINLESS
        not in client.get(f"/api/v1/marketplace/challenges/{key}", headers=bearer(world.token)).text
    )

    committed = client.post(
        f"/api/v1/marketplace/challenges/{key}/selection",
        json=SELECTION,
        headers=bearer(world.token),
    )
    assert committed.status_code == 200, committed.text
    assert [line["sku"] for line in committed.json()["reveal"]["shortlist"]] == [PLATE, STAINLESS]
    assert (
        client.get(f"{base}/{challenge['id']}", headers=world.headers).json()["selection_count"]
        == 1
    )

    # A challenge students have committed to is a record; unpublish instead.
    assert client.delete(f"{base}/{challenge['id']}", headers=world.headers).status_code == 409
    assert client.get(base, headers=world.headers).status_code == 200


def test_a_challenge_is_validated_and_owned(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    world = unpinned(client, storage, tmp_data)
    base = f"/api/v1/courses/{world.course_id}/challenges"
    unknown = client.post(
        base, json={**CHALLENGE, "shortlist": ["LMS-NOPE"]}, headers=world.headers
    )
    assert unknown.status_code == 400 and "LMS-NOPE" in unknown.json()["detail"]
    weights = client.post(base, json={**CHALLENGE, "weights": {"wear": 3}}, headers=world.headers)
    assert weights.status_code == 400
    assert client.post(base, json=CHALLENGE, headers=bearer(world.token)).status_code == 403
    assert client.post(base, json=CHALLENGE).status_code == 401

    created = client.post(base, json=CHALLENGE, headers=world.headers).json()
    assert client.delete(f"{base}/{created['id']}", headers=world.headers).status_code == 204
    assert client.get(f"{base}/{created['id']}", headers=world.headers).status_code == 404

    from app.submissions.test_submissions import professor

    stranger = professor(client, "other@example.edu")
    assert client.get(base, headers=stranger).status_code == 403


# ------------------------------------------------------- the citation


def _commit(client: TestClient, token: str) -> int:
    r = client.post(
        f"/api/v1/marketplace/challenges/{BRIEF_KEY}/selection",
        json=SELECTION,
        headers=bearer(token),
    )
    assert r.status_code == 200, r.text
    return int(r.json()["selection"]["id"])


def _submit(
    client: TestClient, token: str, variant_id: int, selection_id: int
) -> dict[str, object]:
    r = client.post(
        f"/api/v1/variants/{variant_id}/submissions",
        json={
            "pages": [{"content_type": "image/jpeg", "size_bytes": 2 * 1024 * 1024}],
            "selection_id": selection_id,
        },
        headers=bearer(token),
    )
    assert r.status_code == 201, r.text
    return dict(
        client.get(f"/api/v1/submissions/{r.json()['submission_id']}", headers=bearer(token)).json()
    )


def test_a_submission_cites_its_own_selection_and_never_another_seats(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    world = unpinned(client, storage, tmp_data, seats=2)
    first, second = world.tokens
    selection_id = _commit(client, first)
    body = _submit(client, first, world.variant_id, selection_id)
    assert body["selection_id"] == selection_id
    assert str(body["selection_reference"]).startswith("BREE-SEL-")
    # The other seat citing it carries nothing rather than something false.
    stolen = _submit(client, second, world.variant_id, selection_id)
    assert stolen["selection_id"] is None and stolen["selection_reference"] is None


def test_the_rendered_selection_reaches_the_tutor_inside_the_fence(tmp_path: Path) -> None:
    from app.db.connection import connect
    from app.db.migrations import apply_migrations
    from app.db.shards import COURSE_MIGRATIONS

    conn = connect(tmp_path / "course.db")
    try:
        apply_migrations(conn, COURSE_MIGRATIONS)
        stored = commit_selection(
            conn,
            CATALOGUE,
            PRICES,
            seat_id=7,
            key=BRIEF_KEY,
            body=SelectionIn(
                candidates=[PLATE, STAINLESS],
                weights=WEIGHTS,
                lines=[QuoteLineIn(sku=PLATE, quantity=40)],
            ),
            now=1_780_000_000,
        )
    finally:
        conn.close()
    assert isinstance(stored, StoredSelection)
    rendered = render_selection(BRIEF.title, stored)
    assert BRIEF.title in rendered and PLATE in rendered and "rank 1" in rendered
    document = context_document(
        "Find the load.", "Step one.", "My working.", [(1, "Selection")], 0, "", rendered
    )
    assert "## The selection the student committed to a project challenge" in document
    assert any(PLATE in block for block in blocks(document))
    assert "rank 1" not in outside_the_fences(document)
    silent = context_document("Find the load.", "Step one.", "My working.", [(1, "Selection")], 0)
    assert "project challenge" not in silent
