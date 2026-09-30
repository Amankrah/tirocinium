"""The marketplace surfaces end to end (milestones 10.3 to 10.5).

What these hold to account: a course quotes only when its professor said so and
against the version they pinned; a student sees prices nobody else sees; a
quotation freezes when it is issued and is a record from that moment; and one
seat can never read, reprice or delete another seat's work.
"""

import sqlite3
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.compression import compress_text
from app.db.connection import connect
from app.main import create_app
from app.marketplace.advice import RfqIn
from app.storage import get_object_storage
from app.submissions.test_submissions import (
    SECRET,
    FakeObjectStorage,
    bearer,
    make_case_study,
    make_course,
    professor,
    seat_tokens,
)

PLATE = "LMS-A36-PL06"
STAINLESS = "BSA-316L-2B"
CATALOGUE = {"catalogue_id": "bree-216", "catalogue_version": 1}


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

    @property
    def token(self) -> str:
        return self.tokens[0]


def seed_variant(tmp_data: Path, course_id: int, case_study_id: int, seed: int) -> int:
    """A verified variant carrying an explicit seed, which is what the
    marketplace prices against."""
    conn = connect(tmp_data / "courses" / f"{course_id}.db")
    try:
        cur = conn.execute(
            "INSERT INTO variants (case_study_id, seed_json_z, body_z, solution_z,"
            " verification, model_id, created_at, seed)"
            " VALUES (?, ?, ?, ?, 'verified', 'test-model', 1750000000, ?)",
            (
                case_study_id,
                compress_text(conn, "problem_text", '{"seed": 1}'),
                compress_text(conn, "problem_text", "# variant body"),
                compress_text(conn, "problem_text", '{"solution_md": "step"}'),
                seed,
            ),
        )
        conn.commit()
        assert cur.lastrowid is not None
        return int(cur.lastrowid)
    finally:
        conn.close()


def build(
    client: TestClient,
    storage: FakeObjectStorage,
    tmp_data: Path,
    seats: int = 1,
    seed: int = 90_210,
    pin: bool = True,
) -> World:
    headers = professor(client)
    course_id = make_course(client, headers)
    case_study_id = make_case_study(client, headers, course_id)
    variant_id = seed_variant(tmp_data, course_id, case_study_id, seed)
    r = client.post(
        f"/api/v1/courses/{course_id}/case-studies/{case_study_id}/publish",
        headers=headers,
    )
    assert r.status_code in (200, 204), r.text
    if pin:
        r = client.put(f"/api/v1/courses/{course_id}/catalogue", json=CATALOGUE, headers=headers)
        assert r.status_code == 200, r.text
    tokens = seat_tokens(client, headers, course_id, storage, count=seats)
    return World(headers, course_id, case_study_id, variant_id, tokens)


def basket(client: TestClient, token: str, variant_id: int, lines: list[dict[str, object]]) -> int:
    r = client.post(
        f"/api/v1/variants/{variant_id}/quotes",
        json={"lines": lines},
        headers=bearer(token),
    )
    assert r.status_code == 201, r.text
    return int(r.json()["id"])


# ------------------------------------------------------- the course decides


def test_an_unpinned_course_has_no_marketplace(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    """A course that does not quote for materials is the default, and saying so
    is a 409 rather than a 404: the course is there, the setting is off."""
    world = build(client, storage, tmp_data, pin=False)
    r = client.get(f"/api/v1/variants/{world.variant_id}/marketplace", headers=bearer(world.token))
    assert r.status_code == 409
    assert "marketplace" in r.json()["detail"]


def test_a_professor_pins_a_version_and_can_turn_it_off(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    world = build(client, storage, tmp_data, pin=False)
    listing = client.get(f"/api/v1/courses/{world.course_id}/catalogues", headers=world.headers)
    assert listing.status_code == 200
    assert listing.json()["pinned"] is None
    assert any(c["id"] == "bree-216" for c in listing.json()["available"])

    pinned = client.put(
        f"/api/v1/courses/{world.course_id}/catalogue",
        json=CATALOGUE,
        headers=world.headers,
    )
    assert pinned.json()["pinned"]["version"] == 1

    off = client.put(
        f"/api/v1/courses/{world.course_id}/catalogue",
        json={"catalogue_id": None, "catalogue_version": None},
        headers=world.headers,
    )
    assert off.json()["pinned"] is None


def test_a_catalogue_version_that_does_not_exist_is_refused(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    world = build(client, storage, tmp_data, pin=False)
    r = client.put(
        f"/api/v1/courses/{world.course_id}/catalogue",
        json={"catalogue_id": "bree-216", "catalogue_version": 99},
        headers=world.headers,
    )
    assert r.status_code == 404


# ------------------------------------------------------------- the browsing


def test_the_front_door_names_the_suppliers_and_the_terms(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    world = build(client, storage, tmp_data)
    body = client.get(
        f"/api/v1/variants/{world.variant_id}/marketplace", headers=bearer(world.token)
    ).json()
    assert len(body["suppliers"]) == 6
    assert [tax["code"] for tax in body["taxes"]] == ["GST", "QST"]
    assert body["quote_validity_days"] == 14
    assert body["case_study_id"] == world.case_study_id


def test_two_seats_are_quoted_different_prices(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    """The property the whole design exists for. Same course, same case study,
    different variants, so a price passed between them is worth nothing."""
    world = build(client, storage, tmp_data, seats=2, seed=11)
    other_variant = seed_variant(tmp_data, world.course_id, world.case_study_id, 22)

    first = client.get(
        f"/api/v1/variants/{world.variant_id}/marketplace/lines/{PLATE}",
        headers=bearer(world.tokens[0]),
    ).json()
    second = client.get(
        f"/api/v1/variants/{other_variant}/marketplace/lines/{PLATE}",
        headers=bearer(world.tokens[1]),
    ).json()
    assert first["price_cents"] != second["price_cents"]


def test_filtering_narrows_and_never_restricts(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    world = build(client, storage, tmp_data)
    everything = client.get(
        f"/api/v1/variants/{world.variant_id}/marketplace/lines",
        params={"limit": 96},
        headers=bearer(world.token),
    ).json()
    assert everything["total"] == 146

    searched = client.get(
        f"/api/v1/variants/{world.variant_id}/marketplace/lines",
        params={"q": "stainless"},
        headers=bearer(world.token),
    ).json()
    assert 0 < searched["total"] < 146


def test_browsing_pages_without_losing_or_repeating_a_line(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    world = build(client, storage, tmp_data)
    seen: list[str] = []
    cursor: int | None = 0
    while cursor is not None:
        page = client.get(
            f"/api/v1/variants/{world.variant_id}/marketplace/lines",
            params={"cursor": cursor, "limit": 40, "sort": "name"},
            headers=bearer(world.token),
        ).json()
        seen.extend(item["sku"] for item in page["items"])
        cursor = page["next_cursor"]
    assert len(seen) == len(set(seen)) == 146


def test_the_comparison_marks_a_best_in_each_ranked_row(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    world = build(client, storage, tmp_data)
    body = client.post(
        f"/api/v1/variants/{world.variant_id}/marketplace/compare",
        json={"skus": [PLATE, STAINLESS]},
        headers=bearer(world.token),
    ).json()
    assert body["skus"] == [PLATE, STAINLESS]
    ranked = [row for row in body["rows"] if any(cell["best"] for cell in row["cells"])]
    assert ranked, "a comparison with no best anywhere is not a comparison"


# ------------------------------------------------------------ the quotation


def test_a_basket_becomes_an_issued_quotation_and_then_stops_moving(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    world = build(client, storage, tmp_data)
    quote_id = basket(client, world.token, world.variant_id, [{"sku": PLATE, "quantity": 100}])
    draft = client.get(f"/api/v1/quotes/{quote_id}", headers=bearer(world.token)).json()
    assert draft["status"] == "draft"
    assert draft["quote_number"] is None
    assert draft["totals"]["total_cents"] > 0

    issued = client.post(f"/api/v1/quotes/{quote_id}/issue", headers=bearer(world.token)).json()
    assert issued["status"] == "issued"
    assert issued["quote_number"].startswith("BREE-")
    assert issued["valid_until"] == issued["issued_at"] + 14 * 86400
    assert issued["totals"]["total_cents"] == draft["totals"]["total_cents"]

    changed = client.put(
        f"/api/v1/quotes/{quote_id}",
        json={"lines": [{"sku": PLATE, "quantity": 1}]},
        headers=bearer(world.token),
    )
    assert changed.status_code == 409

    again = client.get(f"/api/v1/quotes/{quote_id}", headers=bearer(world.token)).json()
    assert again["totals"] == issued["totals"]
    assert again["quote_number"] == issued["quote_number"]


def test_issuing_twice_does_not_cost_a_quotation_number(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    """A retried request must be harmless. Issuing is the artifact-making act,
    so it is idempotent by construction rather than by a key."""
    world = build(client, storage, tmp_data)
    quote_id = basket(client, world.token, world.variant_id, [{"sku": PLATE, "quantity": 25}])
    first = client.post(f"/api/v1/quotes/{quote_id}/issue", headers=bearer(world.token))
    second = client.post(f"/api/v1/quotes/{quote_id}/issue", headers=bearer(world.token))
    assert first.json()["quote_number"] == second.json()["quote_number"]
    assert first.json()["issued_at"] == second.json()["issued_at"]


def test_an_empty_basket_cannot_be_issued(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    world = build(client, storage, tmp_data)
    quote_id = basket(client, world.token, world.variant_id, [])
    r = client.post(f"/api/v1/quotes/{quote_id}/issue", headers=bearer(world.token))
    assert r.status_code == 409


def test_a_draft_can_be_discarded_and_an_issued_quotation_cannot(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    world = build(client, storage, tmp_data)
    draft_id = basket(client, world.token, world.variant_id, [{"sku": PLATE, "quantity": 25}])
    assert (
        client.delete(f"/api/v1/quotes/{draft_id}", headers=bearer(world.token)).status_code == 204
    )
    assert client.get(f"/api/v1/quotes/{draft_id}", headers=bearer(world.token)).status_code == 404

    kept_id = basket(client, world.token, world.variant_id, [{"sku": PLATE, "quantity": 25}])
    client.post(f"/api/v1/quotes/{kept_id}/issue", headers=bearer(world.token))
    assert (
        client.delete(f"/api/v1/quotes/{kept_id}", headers=bearer(world.token)).status_code == 409
    )


def test_a_seat_cannot_reach_another_seats_quotation(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    """A 404 rather than a 403 throughout, so nobody can enumerate what anyone
    else priced."""
    world = build(client, storage, tmp_data, seats=2)
    quote_id = basket(client, world.tokens[0], world.variant_id, [{"sku": PLATE, "quantity": 25}])
    intruder = bearer(world.tokens[1])
    assert client.get(f"/api/v1/quotes/{quote_id}", headers=intruder).status_code == 404
    assert (
        client.put(
            f"/api/v1/quotes/{quote_id}",
            json={"lines": []},
            headers=intruder,
        ).status_code
        == 404
    )
    assert client.post(f"/api/v1/quotes/{quote_id}/issue", headers=intruder).status_code == 404
    assert client.delete(f"/api/v1/quotes/{quote_id}", headers=intruder).status_code == 404


def test_an_issued_quotation_survives_the_course_moving_off_the_catalogue(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    """The freeze has to outlive the setting that created it. A professor who
    turns the marketplace off must not blank a quotation a student is citing."""
    world = build(client, storage, tmp_data)
    quote_id = basket(client, world.token, world.variant_id, [{"sku": PLATE, "quantity": 100}])
    issued = client.post(f"/api/v1/quotes/{quote_id}/issue", headers=bearer(world.token)).json()
    client.put(
        f"/api/v1/courses/{world.course_id}/catalogue",
        json={"catalogue_id": None, "catalogue_version": None},
        headers=world.headers,
    )
    after = client.get(f"/api/v1/quotes/{quote_id}", headers=bearer(world.token))
    assert after.status_code == 200
    assert after.json()["totals"] == issued["totals"]


# ------------------------------------------------------------- the shortlist


def test_a_shortlist_narrows_without_hiding_anything(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    world = build(client, storage, tmp_data)
    r = client.put(
        f"/api/v1/courses/{world.course_id}/case-studies/{world.case_study_id}/shortlist",
        json={"skus": [STAINLESS, PLATE, "NOT-A-SKU"]},
        headers=world.headers,
    )
    assert r.json()["skus"] == [STAINLESS, PLATE]
    assert r.json()["dropped"] == ["NOT-A-SKU"]

    front = client.get(
        f"/api/v1/variants/{world.variant_id}/marketplace", headers=bearer(world.token)
    ).json()
    assert [line["sku"] for line in front["shortlist"]] == [STAINLESS, PLATE]

    # Everything is still reachable, and the shortlist only sorts first.
    listing = client.get(
        f"/api/v1/variants/{world.variant_id}/marketplace/lines",
        params={"limit": 96},
        headers=bearer(world.token),
    ).json()
    assert listing["total"] == 146
    assert [item["sku"] for item in listing["items"][:2]] == [STAINLESS, PLATE]


def test_a_seat_cannot_edit_a_shortlist(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    world = build(client, storage, tmp_data)
    r = client.put(
        f"/api/v1/courses/{world.course_id}/case-studies/{world.case_study_id}/shortlist",
        json={"skus": [PLATE]},
        headers=bearer(world.token),
    )
    assert r.status_code == 403


# ------------------------------------------------------------------ the RFQ


def test_an_rfq_answers_with_rules_and_names_what_is_missing(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    world = build(client, storage, tmp_data)
    r = client.post(
        f"/api/v1/variants/{world.variant_id}/marketplace/rfqs",
        json={
            "sku": PLATE,
            "component": "Auger trough",
            "quantity": "",
            "environment": "chemical",
            "certification": "mill_test_report",
        },
        headers=bearer(world.token),
    )
    assert r.status_code == 201
    body = r.json()
    rules = {note["rule"] for note in body["advice"]["notes"]}
    assert {"catalogue-terms", "env-chemical", "cert-cmtr"} <= rules
    assert body["advice"]["missing"] == ["a quantity and unit"]
    assert body["reference"].startswith("RFQ-")


def test_the_same_request_always_gets_the_same_answer(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    """Deterministic rules, not a model. Two identical requests that disagreed
    would make the advice unciteable."""
    world = build(client, storage, tmp_data)
    payload = {"sku": PLATE, "quantity": "40 kg", "environment": "buried"}
    first = client.post(
        f"/api/v1/variants/{world.variant_id}/marketplace/rfqs",
        json=payload,
        headers=bearer(world.token),
    ).json()
    second = client.post(
        f"/api/v1/variants/{world.variant_id}/marketplace/rfqs",
        json=payload,
        headers=bearer(world.token),
    ).json()
    assert first["advice"] == second["advice"]

    stored = client.get(
        f"/api/v1/variants/{world.variant_id}/marketplace/rfqs",
        headers=bearer(world.token),
    ).json()
    assert [entry["advice"] for entry in stored] == [second["advice"], first["advice"]]


def test_an_rfq_naming_nothing_says_so_rather_than_inventing_a_price(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    world = build(client, storage, tmp_data)
    body = client.post(
        f"/api/v1/variants/{world.variant_id}/marketplace/rfqs",
        json={"component": "something strong", "quantity": "a few"},
        headers=bearer(world.token),
    ).json()
    rules = {note["rule"] for note in body["advice"]["notes"]}
    assert "unmatched-line" in rules
    assert body["advice"]["missing"] == ["the material or catalogue line to price"]


# ---------------------------------------------------------- the citation


def submit(
    client: TestClient, token: str, variant_id: int, quote_id: int | None
) -> dict[str, object]:
    r = client.post(
        f"/api/v1/variants/{variant_id}/submissions",
        json={
            "pages": [{"content_type": "image/jpeg", "size_bytes": 2 * 1024 * 1024}],
            "quote_id": quote_id,
        },
        headers=bearer(token),
    )
    assert r.status_code == 201, r.text
    got = client.get(f"/api/v1/submissions/{r.json()['submission_id']}", headers=bearer(token))
    assert got.status_code == 200, got.text
    return dict(got.json())


def test_a_submission_cites_its_issued_quotation(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    world = build(client, storage, tmp_data)
    quote_id = basket(client, world.token, world.variant_id, [{"sku": PLATE, "quantity": 100}])
    issued = client.post(f"/api/v1/quotes/{quote_id}/issue", headers=bearer(world.token)).json()
    body = submit(client, world.token, world.variant_id, quote_id)
    assert body["quote_id"] == quote_id
    assert body["quote_number"] == issued["quote_number"]


def test_a_draft_cannot_be_cited(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    """A basket still being filled is not a decision. The citation is dropped
    rather than refused, on the attempt span's terms: it carries nothing rather
    than something false."""
    world = build(client, storage, tmp_data)
    quote_id = basket(client, world.token, world.variant_id, [{"sku": PLATE, "quantity": 25}])
    body = submit(client, world.token, world.variant_id, quote_id)
    assert body["quote_id"] is None


def test_another_seats_quotation_cannot_be_cited(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    world = build(client, storage, tmp_data, seats=2)
    quote_id = basket(client, world.tokens[0], world.variant_id, [{"sku": PLATE, "quantity": 25}])
    client.post(f"/api/v1/quotes/{quote_id}/issue", headers=bearer(world.tokens[0]))
    body = submit(client, world.tokens[1], world.variant_id, quote_id)
    assert body["quote_id"] is None


def test_a_submission_that_cites_nothing_is_complete(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    world = build(client, storage, tmp_data)
    body = submit(client, world.token, world.variant_id, None)
    assert body["quote_id"] is None
    assert body["status"] == "pending"


# --------------------------------------------------------- professor review


def test_the_professor_sees_issued_quotations_and_what_the_cohort_bought(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    world = build(client, storage, tmp_data, seats=2)
    for token in world.tokens:
        quote_id = basket(client, token, world.variant_id, [{"sku": PLATE, "quantity": 100}])
        client.post(f"/api/v1/quotes/{quote_id}/issue", headers=bearer(token))
    draft_only = basket(
        client, world.tokens[0], world.variant_id, [{"sku": STAINLESS, "quantity": 5}]
    )
    assert draft_only

    body = client.get(f"/api/v1/courses/{world.course_id}/quotes", headers=world.headers).json()
    assert len(body["entries"]) == 2
    assert all(entry["quote_number"] for entry in body["entries"])
    tallied = {tally["sku"]: tally for tally in body["tallies"]}
    assert tallied[PLATE]["quote_count"] == 2
    assert tallied[PLATE]["total_quantity"] == 200
    # A basket someone is still filling is not a decision they have made.
    assert STAINLESS not in tallied


def test_a_reviewed_quotation_is_labelled_by_seat_number_and_nothing_else(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    """Seats live in the directory and quotations in the shard, so the label a
    professor reads is joined in Python like every other professor surface. An
    internal seat id would be a second identifier nobody asked for."""
    world = build(client, storage, tmp_data, seats=2)
    for token in world.tokens:
        quote_id = basket(client, token, world.variant_id, [{"sku": PLATE, "quantity": 100}])
        client.post(f"/api/v1/quotes/{quote_id}/issue", headers=bearer(token))

    body = client.get(f"/api/v1/courses/{world.course_id}/quotes", headers=world.headers).json()
    numbers = {entry["seat_number"] for entry in body["entries"]}
    assert len(numbers) == 2
    assert all(number for number in numbers)
    assert all("seat_id" not in entry for entry in body["entries"])


def test_the_professor_is_never_shown_a_students_struck_price(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    """A professor who could read one seat's prices could read them all, and
    per-variant pricing would stop meaning anything."""
    world = build(client, storage, tmp_data)
    body = client.get(
        f"/api/v1/courses/{world.course_id}/catalogue",
        params={"case_study_id": world.case_study_id},
        headers=world.headers,
    ).json()
    plate = next(line for line in body["lines"] if line["sku"] == PLATE)
    assert plate["list_price_cents"] == 520
    assert plate["band_low_cents"] < plate["list_price_cents"] < plate["band_high_cents"]
    assert "price_cents" not in plate


def test_a_professor_never_quotes(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    """The seat surfaces are for seats. A professor reaching them would be
    holding prices struck for somebody's variant, and the whole point of
    striking them per variant is that nobody else holds them."""
    world = build(client, storage, tmp_data)
    for path in ("marketplace", "marketplace/lines", "quotes"):
        r = client.get(f"/api/v1/variants/{world.variant_id}/{path}", headers=world.headers)
        assert r.status_code == 403, path
    created = client.post(
        f"/api/v1/variants/{world.variant_id}/quotes",
        json={"lines": [{"sku": PLATE, "quantity": 25}]},
        headers=world.headers,
    )
    assert created.status_code == 403


def test_nothing_about_a_person_reaches_a_quotation(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    """A seat is the whole identity, and even the code that redeemed it must
    not survive into the artifact. The quotation carries a seat's work, never a
    way back to a person."""
    world = build(client, storage, tmp_data)
    quote_id = basket(client, world.token, world.variant_id, [{"sku": PLATE, "quantity": 100}])
    issued = client.post(f"/api/v1/quotes/{quote_id}/issue", headers=bearer(world.token))
    body = issued.text
    assert world.token not in body
    assert "prof@example.edu" not in body
    # The names on a quotation are a supplier's and a material's, which is what
    # a quotation is made of. Nothing here names a person.
    for key in ("email", "seat_code", "password", "student_name"):
        assert key not in body.casefold(), key

    # The request-for-quotation form has no name field, structurally: a seat
    # cannot volunteer a person because there is nowhere to put one.
    fields = set(RfqIn.model_fields)
    assert fields.isdisjoint({"name", "email", "student", "contact"})


def test_a_professor_cannot_reach_another_professors_course(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    world = build(client, storage, tmp_data)
    stranger = professor(client, email="other@example.edu")
    for path in ("catalogues", "catalogue", "quotes"):
        r = client.get(f"/api/v1/courses/{world.course_id}/{path}", headers=stranger)
        assert r.status_code == 403, path


def test_the_shard_holds_the_frozen_lines_not_a_pointer_to_the_catalogue(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    """The freeze is on disk, not in a join. A quote_lines row has to carry the
    name and the price it was struck at, or the artifact is only as stable as
    the asset file."""
    world = build(client, storage, tmp_data)
    quote_id = basket(client, world.token, world.variant_id, [{"sku": PLATE, "quantity": 100}])
    client.post(f"/api/v1/quotes/{quote_id}/issue", headers=bearer(world.token))
    conn: sqlite3.Connection = connect(tmp_data / "courses" / f"{world.course_id}.db")
    try:
        row = conn.execute(
            "SELECT sku, name, unit_price_cents, extended_cents, mass_grams"
            " FROM quote_lines WHERE quote_id = ?",
            (quote_id,),
        ).fetchone()
    finally:
        conn.close()
    assert row[0] == PLATE
    assert "A36" in row[1]
    assert row[2] > 0
    assert row[3] > 0
    assert row[4] == 100_000
