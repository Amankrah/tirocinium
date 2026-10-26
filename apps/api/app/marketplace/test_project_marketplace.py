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
from app.marketplace.catalogue import available_catalogues, load_catalogue
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
        r = client.get(f"/api/v1/marketplace/lines?limit=96&cursor={cursor}", headers=bearer(token))
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
    # An unpinned seat meets the newest shipped version, whatever it is.
    newest = max(version for cid, version in available_catalogues() if cid == "bree-216")
    assert (front.json()["catalogue_id"], front.json()["catalogue_version"]) == ("bree-216", newest)


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


def test_nothing_is_stored(client: TestClient, storage: FakeObjectStorage, tmp_data: Path) -> None:
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


# ---------------------------------------------------------------------------
# Browsing the way the BREE 216 prototype browses (decision 0100): stores with
# ticked categories and attributes, a brief's candidates by SKU, search over
# what a buyer would type, and sorts on the properties a selection turns on.
# ---------------------------------------------------------------------------


def _items(client: TestClient, token: str, query: str) -> list[dict[str, object]]:
    r = client.get(f"/api/v1/marketplace/lines?limit=96&{query}", headers=bearer(token))
    assert r.status_code == 200, r.text
    return r.json()["items"]  # type: ignore[no-any-return]


def test_ticked_categories_and_attributes_are_alternatives_within_a_group(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    world = build(client, storage, tmp_data)
    lms = [line for line in CATALOGUE.lines if line.supplier == "LMS"]
    two = sorted({line.category for line in lms})[:2]

    both = _items(client, world.token, f"supplier=LMS&category={two[0]}&category={two[1]}")
    assert {item["category"] for item in both} == set(two)
    assert len(both) == sum(1 for line in lms if line.category in two)

    tag = lms[0].tags[0]
    tagged = _items(client, world.token, f"supplier=LMS&tag={tag}")
    assert tagged and all(tag in item["tags"] for item in tagged)  # type: ignore[operator]


def test_a_list_of_skus_comes_back_in_its_own_order(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    world = build(client, storage, tmp_data)
    brief = CATALOGUE.briefs[0]
    asked = [*reversed(brief.shortlist), "NOPE-000"]

    items = _items(client, world.token, "&".join(f"sku={sku}" for sku in asked))

    assert [item["sku"] for item in items] == list(reversed(brief.shortlist))


def test_search_reads_descriptions_and_supplier_names(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    world = build(client, storage, tmp_data)
    supplier = CATALOGUE.suppliers[0]

    by_supplier = _items(client, world.token, f"q={supplier.name.split()[0]}")
    assert {item["supplier_id"] for item in by_supplier} >= {supplier.id}
    word = next(
        token
        for line in CATALOGUE.lines
        for token in line.description.split()
        if len(token) > 8 and token.isalpha() and token.casefold() not in line.name.casefold()
    )
    assert _items(client, world.token, f"q={word}")


def test_the_property_sorts_put_missing_figures_last(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    world = build(client, storage, tmp_data)

    def figures(sort: str, key: str) -> list[float | None]:
        values: list[float | None] = []
        for item in _items(client, world.token, f"sort={sort}"):
            line = CATALOGUE.line(str(item["sku"]))
            assert line is not None
            values.append(getattr(line.properties, key))
        return values

    density = figures("density_asc", "density_kg_m3")
    present = [value for value in density if value is not None]
    assert present == sorted(present)
    assert density[: len(present)] == present  # every missing figure after them

    strength = [v for v in figures("yield_desc", "yield_strength_mpa") if v is not None]
    assert strength == sorted(strength, reverse=True)

    per_kg = [
        item["price_per_kg_cents"]
        for item in _items(client, world.token, "sort=per_kg_asc")
        if item["price_per_kg_cents"] is not None
    ]
    assert per_kg == sorted(per_kg)  # type: ignore[type-var]


def test_a_line_names_what_it_is_weighed_against(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    world = build(client, storage, tmp_data)
    line = CATALOGUE.line(PLATE)
    assert line is not None

    related = client.get(f"/api/v1/marketplace/lines/{PLATE}", headers=bearer(world.token)).json()[
        "related"
    ]

    assert 0 < len(related) <= 4
    for item in related:
        assert item["sku"] != PLATE
        assert item["category"] == line.category or set(item["tags"]) & set(line.tags)


def test_the_comparison_names_its_prices_for_what_they_are(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    world = build(client, storage, tmp_data)
    body = {"skus": [PLATE, STAINLESS]}

    project = client.post("/api/v1/marketplace/compare", json=body, headers=bearer(world.token))
    seeded = client.post(
        f"/api/v1/variants/{world.variant_id}/marketplace/compare",
        json=body,
        headers=bearer(world.token),
    )

    assert project.json()["rows"][0]["label"] == "List price"
    assert seeded.json()["rows"][0]["label"] == "Your price"


def test_a_line_carries_the_comparison_s_own_indices(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    world = build(client, storage, tmp_data)
    detail = client.get(f"/api/v1/marketplace/lines/{PLATE}", headers=bearer(world.token)).json()
    compared = client.post(
        "/api/v1/marketplace/compare", json={"skus": [PLATE]}, headers=bearer(world.token)
    ).json()
    row = {r["key"]: r["cells"][0]["value"] for r in compared["rows"]}

    assert detail["indices"]["specific_strength"] == row["specific_strength"]
    assert detail["indices"]["specific_stiffness"] == row["specific_stiffness"]
    assert detail["indices"]["strength_per_dollar"] == row["strength_per_dollar"]
    assert detail["kg_per_unit"] == CATALOGUE.line(PLATE).kg_per_unit  # type: ignore[union-attr]
