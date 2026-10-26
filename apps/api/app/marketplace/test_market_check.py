"""A shop price sits beside the list price and never becomes it (decision 0111)."""

import json
from datetime import UTC, datetime
from pathlib import Path

from fastapi.testclient import TestClient

from app.marketplace.catalogue import load_catalogue
from app.marketplace.market_check import (
    apply_reading,
    cents_with_taxes,
    checks_path,
    load_sources,
    observed_on,
    public_check,
    read_checks,
    shopify_image_url,
    shopify_variant_cents,
    write_checks,
)
from app.marketplace.test_marketplace import PLATE, World, build
from app.submissions.test_submissions import FakeObjectStorage, bearer

_BODY = json.dumps(
    {
        "title": "Carbon Steel Sheet",
        "price": 842,
        "variants": [
            {"title": 'Up to 6" width / Up to 6" length', "price": 842},
            {"title": 'Up to 12" width / Up to 12" length', "price": 1547},
        ],
    }
).encode()


def test_the_named_cut_is_the_price_and_the_smallest_cut_is_not() -> None:
    assert shopify_variant_cents(_BODY, 'Up to 12" width / Up to 12" length') == 1547
    assert shopify_variant_cents(_BODY, 'Up to 6" width / Up to 6" length') == 842


def test_the_photograph_is_the_shops_and_a_failed_read_keeps_it() -> None:
    body = json.dumps(
        {"featured_image": "//cdn.shopify.com/s/files/1/bar.png", "variants": []}
    ).encode()
    assert shopify_image_url(body) == "https://cdn.shopify.com/s/files/1/bar.png"
    other = json.dumps({"featured_image": "https://example.com/a.png"}).encode()
    assert shopify_image_url(other) is None
    source = load_sources()
    listing = source.listings[0]
    picture = "https://cdn.shopify.com/s/files/1/bar.png"
    kept = apply_reading(None, source, listing, cents=1582, error=None, now=1, image=picture)
    failed = apply_reading(kept, source, listing, cents=None, error="HTTPError", now=2)
    assert failed["image"] == picture
    shown = public_check(kept)
    assert shown is not None
    assert shown.image == picture


def test_a_missing_cut_a_zero_and_a_string_are_not_a_price() -> None:
    assert shopify_variant_cents(_BODY, '12" length') is None
    zero = json.dumps({"variants": [{"title": '12" length', "price": 0}]}).encode()
    assert shopify_variant_cents(zero, '12" length') is None
    text = json.dumps({"variants": [{"title": '12" length', "price": "15.47"}]}).encode()
    assert shopify_variant_cents(text, '12" length') is None
    assert shopify_variant_cents(b"not json", '12" length') is None


def test_a_failed_read_keeps_the_previous_figure() -> None:
    source = load_sources()
    listing = source.listings[0]
    kept = apply_reading(None, source, listing, cents=1547, error=None, now=1_700_000_000)
    failed = apply_reading(
        kept, source, listing, cents=None, error="cut not on the page", now=1_700_000_100
    )
    assert failed["cents"] == 1547
    assert failed["observed_at"] == 1_700_000_000
    assert failed["last_error"] == "cut not on the page"
    assert public_check(failed) is not None
    assert public_check(failed).stale is True  # type: ignore[union-attr]

    again = apply_reading(failed, source, listing, cents=1600, error=None, now=1_700_000_200)
    assert again["cents"] == 1600
    assert again["last_error"] is None
    assert public_check(again).stale is False  # type: ignore[union-attr]


def test_a_reading_that_never_succeeded_is_not_shown() -> None:
    source = load_sources()
    listing = source.listings[0]
    failed = apply_reading(None, source, listing, cents=None, error="HTTPError", now=1)
    assert public_check(failed) is None


def test_an_unreadable_file_is_not_an_empty_one(tmp_path: Path) -> None:
    path = checks_path(tmp_path)
    path.write_text("{", encoding="utf-8")
    assert read_checks(path) is None
    assert read_checks(tmp_path / "absent.json") == {}


def test_quebec_tax_is_added_to_the_published_price_and_not_stacked() -> None:
    # GST 5% and QST 9.975%, each on the pre-tax cents. 1547 is the A36 panel.
    assert cents_with_taxes(1547, (0.05, 0.09975)) == 1778


def test_the_day_is_named_in_montreal() -> None:
    # 16:00 UTC is noon in Toronto in October, the same calendar day.
    moment = int(datetime(2026, 10, 26, 16, 0, tzinfo=UTC).timestamp())
    assert observed_on(moment) == "26 Oct 2026"


def test_the_sources_name_lines_the_catalogue_stocks() -> None:
    catalogue = load_catalogue("bree-216", 3)
    sources = load_sources()
    skus = [item.sku for item in sources.listings]
    assert len(skus) == len(set(skus))
    assert sources.currency == "CAD"
    for item in sources.listings:
        assert catalogue.line(item.sku) is not None
        assert item.url.startswith("https://metalsrus.ca/products/")
        assert item.url.endswith(".js")
        assert item.page == item.url.removesuffix(".js")
        assert item.variant
        assert item.what


def test_the_line_keeps_its_list_price_beside_the_shop_reading(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    world: World = build(client, storage, tmp_data)
    catalogue = load_catalogue("bree-216", 1)
    bar = "LMS-1018-CD"
    listed = catalogue.line(bar)
    assert listed is not None
    listing = next(item for item in load_sources().listings if item.sku == bar)
    moment = int(datetime(2026, 10, 26, 16, 0, tzinfo=UTC).timestamp())
    reading = {
        "store": "Metals 'R' Us",
        "place": "Dartmouth, NS",
        "page": listing.page,
        "what": listing.what,
        "cents": 1582,
        "currency": "CAD",
        "observed_at": moment,
        "last_attempt_at": moment,
        "last_error": None,
    }
    write_checks(checks_path(tmp_data), {bar: reading, PLATE: reading})

    detail = client.get(f"/api/v1/marketplace/lines/{bar}", headers=bearer(world.token))
    assert detail.status_code == 200, detail.text
    body = detail.json()
    assert body["price_cents"] == listed.list_price_cents
    assert body["market_check"]["cents"] == 1582
    assert body["market_check"]["what"] == "12 in length."
    assert body["market_check"]["currency"] == "CAD"
    assert body["market_check"]["observed_on"] == "26 Oct 2026"
    assert body["market_check"]["stale"] is False
    assert "last_error" not in body["market_check"]

    # A stored reading for a line the shop does not sell in this section is not shown.
    plate = client.get(f"/api/v1/marketplace/lines/{PLATE}", headers=bearer(world.token))
    assert plate.status_code == 200, plate.text
    assert plate.json()["market_check"] is None

    quoted = client.post(
        "/api/v1/marketplace/quotation",
        json={"lines": [{"sku": bar, "quantity": 1}]},
        headers=bearer(world.token),
    )
    assert quoted.status_code == 200, quoted.text
    assert quoted.json()["lines"][0]["unit_price_cents"] == listed.list_price_cents

    seeded = client.get(
        f"/api/v1/variants/{world.variant_id}/marketplace/lines/{bar}",
        headers=bearer(world.token),
    )
    assert seeded.status_code == 200, seeded.text
    assert seeded.json()["market_check"] is None
