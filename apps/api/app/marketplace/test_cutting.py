"""Cut-to-size orders (decision 0114).

What these hold to account. A plate piece is priced by finished cut mass from
its dimensions and the density, as the service centre's own policy says; a
tube order bills the cut length, nests into stock lengths with the kerf, and
says what is left; a sheet sold each consumes whole sheets; a roll bills the
area cut. A piece the shop would not cut (too short, longer than stock, off
the increment, wider than the plate) is a stated refusal. In a basket, pieces
set the quantity and the cuts, waive the uncut-stock minimum, and charge the
cutting rule's fee per piece; an issued quotation reads its pieces back. And
catalogue v8's geometry agrees with the mass per unit each line already
carried, so a figure a student is quoted by the piece is the figure the
comparison already showed per metre.
"""

import math
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.marketplace.catalogue import CUTTABLE_FORMS, load_catalogue
from app.marketplace.cutting import (
    CannotCut,
    PieceIn,
    cuttable,
    resolve_pieces,
    section_area_mm2,
)
from app.marketplace.listing import list_prices
from app.marketplace.quoting import QuoteLineIn, compute_quote
from app.marketplace.test_marketplace import PLATE, World, build
from app.submissions.test_submissions import FakeObjectStorage, bearer

V8 = load_catalogue("bree-216", 8)
PRICES = list_prices(V8)
TUBE = "LMS-HSS-5032"
BAR = "LMS-1018-CD"
SHEET = "CPP-UHMW-SH12"
ROLL = "TFC-WR-600"


def line(sku: str):  # type: ignore[no-untyped-def]
    found = V8.line(sku)
    assert found is not None
    return found


# ----------------------------------------------------------- the pieces


def test_a_plate_piece_is_priced_by_finished_cut_mass() -> None:
    # Two 300 x 400 mm pieces of 6 mm A36: 0.3 * 0.4 * 0.006 m³ * 7850 = 5.652 kg each.
    order = resolve_pieces(line(PLATE), [PieceIn(length_mm=400, width_mm=300, count=2)])
    assert order.pieces[0].each_mass_grams == 5652
    assert order.quantity == pytest.approx(11.304)
    assert order.cut_count == 2 and order.stock_lengths == 1
    assert order.tolerance_mm == 2


def test_a_tube_order_bills_the_cut_length_and_nests_into_stock() -> None:
    # Four 1.2 m rails and two 2.5 m posts from 6.1 m lengths with a 3 mm kerf:
    # 2.5 + 2.5 and 1.2 x 3 fit one length (6 103 mm needs 6.1 m, so 1.2 x 3 =
    # 3 609 with kerf); the solver reports what it used and what is left.
    order = resolve_pieces(
        line(TUBE),
        [PieceIn(length_mm=1200, count=4), PieceIn(length_mm=2500, count=2)],
    )
    assert order.quantity == pytest.approx(9.8)
    assert order.cut_count == 6
    assert order.stock_lengths == 2
    assert order.remnant_mm is not None and 0 < order.remnant_mm < 6100
    # Mass per piece from the section and the density, close to the catalogue's
    # 4.94 kg/m for a 50 x 50 x 3.2 tube.
    rail = next(p for p in order.pieces if p.length_mm == 1200)
    assert rail.each_mass_grams == pytest.approx(1200 / 1000 * 4940, rel=0.1)


def test_a_bar_sold_by_mass_is_priced_by_the_mass_of_its_pieces() -> None:
    # Ten 150 mm offcuts of 25 mm 1018 round: pi/4 * 25² * 150 mm³ * 7870 kg/m³.
    each = math.pi / 4 * 25**2 * 150 * 7870 / 1e6
    order = resolve_pieces(line(BAR), [PieceIn(length_mm=150, count=10)])
    assert order.pieces[0].each_mass_grams == round(each)
    assert order.quantity == pytest.approx(10 * round(each) / 1000)


def test_a_sheet_sold_each_consumes_whole_sheets() -> None:
    # Five 600 x 600 pieces of a 1220 x 2440 sheet: 1.8 m² of 2.977 m², one sheet.
    order = resolve_pieces(line(SHEET), [PieceIn(length_mm=600, width_mm=600, count=5)])
    assert order.quantity == 1 and order.stock_lengths == 1
    assert any("offcut is yours" in note for note in order.notices)
    # Nine of them need a second sheet.
    more = resolve_pieces(line(SHEET), [PieceIn(length_mm=600, width_mm=600, count=9)])
    assert more.quantity == 2


def test_a_roll_bills_the_area_cut_off_it() -> None:
    # Three 2 m lengths of a 1.27 m roll at full width: 7.62 m².
    order = resolve_pieces(line(ROLL), [PieceIn(length_mm=2000, count=3)])
    assert order.quantity == pytest.approx(7.62)
    strip = resolve_pieces(line(ROLL), [PieceIn(length_mm=2000, width_mm=500, count=1)])
    assert strip.quantity == pytest.approx(1.0)


@pytest.mark.parametrize(
    ("sku", "pieces", "reason"),
    [
        (TUBE, [PieceIn(length_mm=10, count=1)], "shortest"),
        (TUBE, [PieceIn(length_mm=7000, count=1)], "longer than the stock"),
        (TUBE, [PieceIn(length_mm=100.5, count=1)], "steps"),
        (PLATE, [PieceIn(length_mm=400, count=1)], "needs a width"),
        (PLATE, [PieceIn(length_mm=3000, width_mm=300, count=1)], "longer than the stock"),
        (PLATE, [PieceIn(length_mm=2000, width_mm=1300, count=1)], "does not fit"),
        ("TFC-POLY-GP", [PieceIn(length_mm=400, count=1)], "not cut to size"),
    ],
)
def test_a_piece_the_shop_would_not_cut_is_a_stated_refusal(
    sku: str, pieces: list[PieceIn], reason: str
) -> None:
    with pytest.raises(CannotCut, match=reason):
        resolve_pieces(line(sku), pieces)


# ----------------------------------------------------------- the basket


def test_pieces_set_the_quantity_the_cuts_and_the_fee_and_waive_the_minimum() -> None:
    quote = compute_quote(
        V8,
        PRICES,
        [QuoteLineIn(sku=TUBE, pieces=[PieceIn(length_mm=1200, count=4)])],
    )
    [item] = quote.lines
    assert item.quantity == pytest.approx(4.8)  # below the 6.1 m uncut minimum, allowed
    assert item.cut_to_length and item.cut_count == 4
    assert item.cut_fee_cents == 4 * 750
    assert item.extended_cents == round(1790 * 4.8)
    assert [p.count for p in item.pieces] == [4]
    assert item.stock_lengths == 1 and item.tolerance_mm == 1.5
    assert not any("minimum order" in note for note in quote.notices)
    assert any("cut piece" in note for note in quote.notices)


def test_a_refused_piece_leaves_the_line_off_with_the_reason() -> None:
    quote = compute_quote(
        V8,
        PRICES,
        [
            QuoteLineIn(sku=TUBE, pieces=[PieceIn(length_mm=9000, count=1)]),
            QuoteLineIn(sku=PLATE, quantity=40),
        ],
    )
    assert [item.sku for item in quote.lines] == [PLATE]
    assert any("longer than the stock" in note for note in quote.notices)


def test_a_line_needs_a_quantity_or_pieces() -> None:
    with pytest.raises(ValueError, match="quantity or a list of pieces"):
        QuoteLineIn(sku=TUBE)


def test_an_issued_quotation_reads_its_pieces_back(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    world: World = build(client, storage, tmp_data)
    pinned = client.put(
        f"/api/v1/courses/{world.course_id}/catalogue",
        json={"catalogue_id": "bree-216", "catalogue_version": 8},
        headers=world.headers,
    )
    assert pinned.status_code == 200, pinned.text
    r = client.post(
        f"/api/v1/variants/{world.variant_id}/quotes",
        json={"lines": [{"sku": TUBE, "pieces": [{"length_mm": 1200, "count": 4}]}]},
        headers=bearer(world.token),
    )
    assert r.status_code == 201, r.text
    quote_id = r.json()["id"]
    assert r.json()["lines"][0]["pieces"] == [
        {
            "length_mm": 1200.0,
            "width_mm": None,
            "count": 4,
            "each_mass_grams": pytest.approx(5928, abs=600),
        }
    ]
    issued = client.post(f"/api/v1/quotes/{quote_id}/issue", headers=bearer(world.token))
    assert issued.status_code == 200, issued.text
    again = client.get(f"/api/v1/quotes/{quote_id}", headers=bearer(world.token)).json()
    assert again["status"] == "issued"
    [item] = again["lines"]
    assert item["pieces"][0]["length_mm"] == 1200 and item["pieces"][0]["count"] == 4
    assert item["cut_count"] == 4 and item["quantity"] == pytest.approx(4.8)


def test_the_project_quotation_prices_pieces_at_list(
    client: TestClient, storage: FakeObjectStorage, tmp_data: Path
) -> None:
    world: World = build(client, storage, tmp_data, pin=False)
    r = client.post(
        "/api/v1/marketplace/quotation",
        json={
            "lines": [{"sku": PLATE, "pieces": [{"length_mm": 400, "width_mm": 300, "count": 2}]}]
        },
        headers=bearer(world.token),
    )
    assert r.status_code == 200, r.text
    [item] = r.json()["lines"]
    assert item["quantity"] == pytest.approx(11.304)
    assert item["pieces"][0]["each_mass_grams"] == 5652
    assert r.json()["reference"]


# -------------------------------------------------------------- the asset


def test_every_cuttable_line_has_a_rule_and_its_geometry_matches_its_mass() -> None:
    for entry in V8.lines:
        assert entry.geometry is not None, entry.sku
        if entry.geometry.form in CUTTABLE_FORMS:
            assert entry.geometry.cut is not None, entry.sku
            assert cuttable(entry)
        area = section_area_mm2(entry.geometry)
        if area and entry.unit == "m" and entry.properties.density_kg_m3:
            # Mass per metre from the section against the catalogue's own.
            derived = area * 1000 * entry.properties.density_kg_m3 / 1e9
            assert derived == pytest.approx(entry.kg_per_unit, rel=0.15), (
                entry.sku,
                derived,
                entry.kg_per_unit,
            )


def test_a_catalogue_before_v8_sells_by_the_unit_only() -> None:
    old = load_catalogue("bree-216", 7)
    assert old.line(TUBE) is not None and old.line(TUBE).geometry is None  # type: ignore[union-attr]
    with pytest.raises(CannotCut, match="not cut to size"):
        resolve_pieces(old.line(TUBE), [PieceIn(length_mm=1200, count=1)])  # type: ignore[arg-type]
