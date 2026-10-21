"""The project marketplace (decision 0100): any seat, list prices, and nothing
stored.

What these hold to account: the prices are the catalogue's list prices and so
are the same for every student in every course; a course that does not price
materials still has a project marketplace; the quotation is the case-study
arithmetic run at list prices; and preparing a quotation or asking for advice
leaves no row anywhere.
"""

from pathlib import Path

from fastapi.testclient import TestClient

from app.db.connection import connect
from app.marketplace.catalogue import load_catalogue
from app.marketplace.listing import list_prices
from app.marketplace.quoting import QuoteLineIn, compute_quote
from app.marketplace.test_marketplace import CATALOGUE as PIN
from app.marketplace.test_marketplace import (
    PLATE,
    STAINLESS,
    World,
    build,
    seed_variant,
)
from app.submissions.test_submissions import (
    FakeObjectStorage,
    bearer,
    make_case_study,
    make_course,
    seat_tokens,
)

CATALOGUE = load_catalogue("bree-216", 1)


def _second_course(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path, first: World, seed: int
) -> World:
    """Another course by the same professor, pinned and with its own variant."""
    course_id = make_course(client, first.headers)
    case_study_id = make_case_study(client, first.headers, course_id)
    variant_id = seed_variant(tmp_data, course_id, case_study_id, seed)
    client.post(
        f"/api/v1/courses/{course_id}/case-studies/{case_study_id}/publish",
        headers=first.headers,
    )
    client.put(f"/api/v1/courses/{course_id}/catalogue", json=PIN, headers=first.headers)
    # seat_tokens redeems the first seat-code export it finds, so the first
    # course's export has to go or this course's seat would be that course's.
    for key in [key for key in storage.objects if key[1].endswith(".csv")]:
        del storage.objects[key]
    tokens = seat_tokens(client, first.headers, course_id, storage, count=1)
    return World(first.headers, course_id, case_study_id, variant_id, tokens)


def _rows(tmp_data: Path, course_id: int) -> dict[str, int]:
    conn = connect(tmp_data / "courses" / f"{course_id}.db")
    try:
        return {
            table: int(conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0])
            for table in ("quotes", "quote_lines", "rfqs")
        }
    finally:
        conn.close()


def _all_lines(client: TestClient, token: str) -> dict[str, int]:
    prices: dict[str, int] = {}
    cursor: int | None = 0
    while cursor is not None:
        r = client.get(
            f"/api/v1/marketplace/lines?limit=96&cursor={cursor}", headers=bearer(token)
        )
        assert r.status_code == 200, r.text
        prices.update({item["sku"]: item["price_cents"] for item in r.json()["items"]})
        cursor = r.json()["next_cursor"]
    return prices


def test_every_line_is_at_its_list_price(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    world = build(client, storage, tmp_data)

    front = client.get("/api/v1/marketplace", headers=bearer(world.token))
    assert front.status_code == 200, front.text
    assert front.json()["price_basis"] == "list"
    assert len(front.json()["briefs"]) == len(CATALOGUE.briefs)

    assert _all_lines(client, world.token) == list_prices(CATALOGUE)
    detail = client.get(f"/api/v1/marketplace/lines/{PLATE}", headers=bearer(world.token))
    assert detail.json()["price_cents"] == CATALOGUE.line(PLATE).list_price_cents  # type: ignore[union-attr]


def test_students_in_different_courses_see_the_same_prices(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    first = build(client, storage, tmp_data, seed=1)
    second = _second_course(client, storage, tmp_data, first, seed=2)
    assert first.course_id != second.course_id

    assert _all_lines(client, first.token) == _all_lines(client, second.token)
    # The case-study marketplace still moves with the seed; only this surface
    # is a shared price list.
    seeded = [
        client.get(
            f"/api/v1/variants/{w.variant_id}/marketplace/lines/{STAINLESS}",
            headers=bearer(w.token),
        ).json()["price_cents"]
        for w in (first, second)
    ]
    assert seeded[0] != seeded[1]


def test_a_course_that_does_not_price_materials_still_has_one(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    world = build(client, storage, tmp_data, pin=False)

    # The case-study marketplace is a course setting and stays closed...
    closed = client.get(
        f"/api/v1/variants/{world.variant_id}/marketplace", headers=bearer(world.token)
    )
    assert closed.status_code == 409
    # ...and the project marketplace is not that setting.
    front = client.get("/api/v1/marketplace", headers=bearer(world.token))
    assert front.status_code == 200, front.text
    assert (front.json()["catalogue_id"], front.json()["catalogue_version"]) == ("bree-216", 1)


def test_only_a_seat_may_use_it(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    world = build(client, storage, tmp_data)

    assert client.get("/api/v1/marketplace").status_code == 401
    assert client.get("/api/v1/marketplace", headers=world.headers).status_code == 403
    r = client.post(
        "/api/v1/marketplace/quotation",
        json={"lines": [{"sku": PLATE, "quantity": 1}]},
        headers=world.headers,
    )
    assert r.status_code == 403


def test_the_quotation_is_the_case_study_arithmetic_at_list_prices(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    world = build(client, storage, tmp_data)
    basket = [
        {"sku": PLATE, "quantity": 3, "cut_to_length": True, "cut_count": 2},
        {"sku": STAINLESS, "quantity": 1},
    ]

    r = client.post(
        "/api/v1/marketplace/quotation", json={"lines": basket}, headers=bearer(world.token)
    )

    assert r.status_code == 200, r.text
    body = r.json()
    expected = compute_quote(
        CATALOGUE, list_prices(CATALOGUE), [QuoteLineIn.model_validate(line) for line in basket]
    )
    assert body["totals"] == expected.totals.model_dump()
    assert [line["unit_price_cents"] for line in body["lines"]] == [
        line.unit_price_cents for line in expected.lines
    ]
    assert body["valid_until"] - body["prepared_at"] == CATALOGUE.quote_validity_days * 86400
    assert body["reference"].startswith("BREE-P-")


def test_the_reference_follows_the_basket(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    world = build(client, storage, tmp_data)

    def reference(lines: list[dict[str, object]]) -> str | None:
        r = client.post(
            "/api/v1/marketplace/quotation", json={"lines": lines}, headers=bearer(world.token)
        )
        assert r.status_code == 200, r.text
        return r.json()["reference"]  # type: ignore[no-any-return]

    # Above the line's minimum order, so neither quantity is raised to it (two
    # baskets raised to the same minimum are the same basket, and rightly share
    # a reference).
    moq = CATALOGUE.line(PLATE).moq  # type: ignore[union-attr]
    one = [{"sku": PLATE, "quantity": moq + 1}]
    assert reference(one) == reference(one)
    assert reference(one) != reference([{"sku": PLATE, "quantity": moq + 2}])
    # An empty basket is not a quotation, so it carries no reference.
    assert reference([]) is None


def test_an_unknown_line_is_a_notice_not_a_failure(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    world = build(client, storage, tmp_data)

    assert (
        client.get("/api/v1/marketplace/lines/NOPE-000", headers=bearer(world.token)).status_code
        == 404
    )
    r = client.post(
        "/api/v1/marketplace/quotation",
        json={"lines": [{"sku": "NOPE-000", "quantity": 1}]},
        headers=bearer(world.token),
    )
    assert r.status_code == 200, r.text
    assert r.json()["lines"] == []
    assert r.json()["notices"]


def test_nothing_is_stored(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    world = build(client, storage, tmp_data)
    before = _rows(tmp_data, world.course_id)

    quoted = client.post(
        "/api/v1/marketplace/quotation",
        json={"lines": [{"sku": PLATE, "quantity": 4}]},
        headers=bearer(world.token),
    )
    asked = client.post(
        "/api/v1/marketplace/rfq",
        json={
            "sku": PLATE,
            "component": "Hopper wall",
            "quantity": "4 sheets",
            "volume": "prototype",
            "environment": "washdown",
            "certification": "sanitary_3a",
        },
        headers=bearer(world.token),
    )
    compared = client.post(
        "/api/v1/marketplace/compare",
        json={"skus": [PLATE, STAINLESS]},
        headers=bearer(world.token),
    )

    assert quoted.status_code == asked.status_code == compared.status_code == 200
    assert asked.json()["advice"]["notes"]
    assert _rows(tmp_data, world.course_id) == before == {"quotes": 0, "quote_lines": 0, "rfqs": 0}
    # And nothing about the seat comes back in what is handed to the student.
    for response in (quoted, asked, compared):
        assert world.token not in response.text
