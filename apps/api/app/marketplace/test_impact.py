"""The environmental layer (decision 0110).

What these hold to account: v3 is v2's lines and prices with the indicator
table laid over them; the theoretical recyclability stays, and the realistic
recovery sits beside it; a missing figure is null, including on v1; the bands,
the per-unit figures and the carbon-weighted indices match figures worked by
hand; a comparison of a catalogue that has no carbon does not grow empty rows;
and a quotation sums only the lines that publish a figure, and says so.
"""

import math

import pytest

from app.marketplace.catalogue import load_catalogue
from app.marketplace.impact import (
    carbon_for_stiffness,
    carbon_for_strength,
    carbon_per_dollar,
    carbon_per_unit,
    embodied_energy_per_unit,
    impact_band,
    water_per_unit,
)
from app.marketplace.indices import compare
from app.marketplace.listing import list_prices, select_lines
from app.marketplace.quoting import QuoteLineIn, compute_quote

PLATE = "LMS-A36-PL06"
ALUMINIUM = "LMS-6061-PL06"
REBAR = "LMS-REBAR-15M"
HSS = "LMS-HSS-5048"
FLAX = "TFC-FLAX-300"
CARBON = "TFC-CF-200"
BALSA = "TFC-BALSA-12"
TITANIUM = "BSA-TI-GR2"
IRON = "LMS-CI-G30"
CNC = "MFW-CNC3-HR"
CMTR = "MFW-CERT-CMTR"


def test_v1_has_no_carbon_layer() -> None:
    plate = load_catalogue("bree-216", 1).line(PLATE)
    assert plate is not None
    assert plate.properties.carbon_kg_co2e is None
    assert plate.properties.end_of_life_recovery_percent is None
    assert plate.process_energy_mj is None
    assert plate.end_of_life == ""


def test_v3_keeps_v2_prices_and_splits_recovery_from_recyclability() -> None:
    v2 = load_catalogue("bree-216", 2)
    v3 = load_catalogue("bree-216", 3)
    assert [line.sku for line in v2.lines] == [line.sku for line in v3.lines]
    assert [line.list_price_cents for line in v2.lines] == [
        line.list_price_cents for line in v3.lines
    ]

    plate = v3.line(PLATE)
    assert plate is not None
    assert plate.properties.carbon_kg_co2e == pytest.approx(2.10)
    assert plate.properties.embodied_energy_mj_kg == 24
    assert plate.properties.water_l_kg == 55
    assert plate.properties.recyclability_percent == 98
    assert plate.properties.end_of_life_recovery_percent == 88
    assert plate.properties.min_service_temp_c == -20
    assert plate.properties.yield_strength_mpa == v2.line(PLATE).properties.yield_strength_mpa
    assert "electric arc furnace" in plate.end_of_life

    # The L9 energy replaces the earlier one where the indicator table names
    # one. Rebar was 22 MJ/kg in v2 and is 11 here. Its theoretical
    # recyclability is untouched.
    rebar_v2 = v2.line(REBAR)
    rebar = v3.line(REBAR)
    assert rebar_v2 is not None and rebar is not None
    assert rebar_v2.properties.embodied_energy_mj_kg == 22
    assert rebar.properties.embodied_energy_mj_kg == 11
    assert rebar.properties.recyclability_percent == rebar_v2.properties.recyclability_percent
    assert rebar.properties.end_of_life_recovery_percent == 95


def test_a_published_zero_is_kept_and_a_negative_is_kept() -> None:
    v3 = load_catalogue("bree-216", 3)
    iron = v3.line(IRON)
    assert iron is not None
    assert iron.properties.min_service_temp_c == 0

    balsa = v3.line(BALSA)
    assert balsa is not None
    assert balsa.properties.carbon_kg_co2e == pytest.approx(-1.30)
    assert impact_band("co2", balsa.properties.carbon_kg_co2e) == "Carbon negative"

    cmtr = v3.line(CMTR)
    assert cmtr is not None
    assert embodied_energy_per_unit(cmtr) == 0
    assert carbon_per_unit(cmtr) == 0
    assert water_per_unit(cmtr) is None


def test_per_unit_figures_follow_the_unit_of_sale() -> None:
    v3 = load_catalogue("bree-216", 3)
    tube = v3.line(HSS)
    assert tube is not None
    assert carbon_per_unit(tube) == pytest.approx(6.4 * 2.50)
    assert embodied_energy_per_unit(tube) == pytest.approx(6.4 * 28)

    cnc = v3.line(CNC)
    assert cnc is not None
    assert cnc.properties.carbon_kg_co2e is None
    assert embodied_energy_per_unit(cnc) == 54
    assert carbon_per_unit(cnc) == pytest.approx(0.02)
    assert "Québec" in cnc.process_note


def test_carbon_indices_match_a_hand_worked_figure() -> None:
    """A36 against 6061-T6. Specific strength favours the aluminium. Carbon
    for a strength-limited tie favours the steel, which is the trade-off."""
    v3 = load_catalogue("bree-216", 3)
    plate = v3.line(PLATE)
    aluminium = v3.line(ALUMINIUM)
    assert plate is not None and aluminium is not None

    assert carbon_for_strength(plate) == pytest.approx(7850 * 2.10 / 250)
    assert carbon_for_strength(aluminium) == pytest.approx(2700 * 9.50 / 276)
    assert carbon_for_strength(plate) < carbon_for_strength(aluminium)

    assert carbon_for_stiffness(plate) == pytest.approx(7850 * 2.10 / math.sqrt(200))
    assert carbon_per_dollar(plate, plate.list_price_cents) == pytest.approx(2.10 / 5.20)


def test_bands_are_the_lecture_scale() -> None:
    assert impact_band("co2", 2.10) == "Moderate"
    assert impact_band("co2", 9.50) == "High"
    assert impact_band("co2", 38) == "Very high"
    assert impact_band("co2", None) is None
    assert impact_band("h2o", 2500) == "Very high"
    assert impact_band("ee", 24) == "Moderate"
    assert impact_band("recy", 88) == "Excellent"
    assert impact_band("recy", 5) == "Very poor"


def test_a_v1_comparison_grows_no_empty_environmental_rows() -> None:
    catalogue = load_catalogue("bree-216", 1)
    prices = list_prices(catalogue)
    rows = {row.key for row in compare(catalogue, prices, [PLATE, ALUMINIUM]).rows}
    assert "embodied_energy" in rows
    assert "carbon" not in rows
    assert "water" not in rows
    assert "recovery" not in rows
    assert "carbon_for_strength" not in rows
    assert "min_temp" not in rows


def test_the_lower_carbon_is_marked_and_the_band_is_on_the_cell() -> None:
    catalogue = load_catalogue("bree-216", 3)
    prices = list_prices(catalogue)
    compared = compare(catalogue, prices, [PLATE, ALUMINIUM])
    carbon = next(row for row in compared.rows if row.key == "carbon")
    by_sku = {cell.sku: cell for cell in carbon.cells}
    assert by_sku[PLATE].best
    assert not by_sku[ALUMINIUM].best
    assert by_sku[PLATE].value == pytest.approx(2.10)
    assert "Moderate" in by_sku[PLATE].display
    assert "High" in by_sku[ALUMINIUM].display

    strength = next(row for row in compared.rows if row.key == "specific_strength")
    strength_by_sku = {cell.sku: cell for cell in strength.cells}
    assert strength_by_sku[ALUMINIUM].best
    assert not strength_by_sku[PLATE].best

    fibres = compare(catalogue, prices, [FLAX, CARBON])
    water_row = next(row for row in fibres.rows if row.key == "water")
    water = {cell.sku: cell for cell in water_row.cells}
    footprint = {
        cell.sku: cell for cell in next(row for row in fibres.rows if row.key == "carbon").cells
    }
    assert water[CARBON].best
    assert footprint[FLAX].best


def test_carbon_sorts_low_to_high_with_the_missing_last() -> None:
    catalogue = load_catalogue("bree-216", 3)
    listed = select_lines(
        catalogue,
        list_prices(catalogue),
        supplier=None,
        category=None,
        tag=None,
        q=None,
        sort="carbon_asc",
        cursor=0,
        limit=4,
        skus=[PLATE, BALSA, TITANIUM, CNC],
    )
    assert [item.sku for item in listed.items] == [BALSA, PLATE, TITANIUM, CNC]
    assert listed.items[0].carbon_kg_co2e == pytest.approx(-1.30)
    assert listed.items[-1].carbon_kg_co2e is None
    assert listed.items[-1].process_carbon_kg == pytest.approx(0.02)


def test_a_v3_basket_sums_cradle_to_gate_and_states_freight_beside_it() -> None:
    """100 kg of A36 plate. Carbon 210 kg, energy 2,400 MJ, water 5,500 L.
    Freight carbon is 100 kg over 450 km at 0.11 kg CO2e per tonne-km, which
    is 4.95, and it is not inside the 210."""
    catalogue = load_catalogue("bree-216", 3)
    quote = compute_quote(
        catalogue,
        list_prices(catalogue),
        [QuoteLineIn(sku=PLATE, quantity=100), QuoteLineIn(sku=CNC, quantity=1)],
    )
    totals = quote.totals
    assert totals.carbon_kg == pytest.approx(210 + 0.02)
    assert totals.embodied_energy_mj == pytest.approx(2400 + 54)
    assert totals.water_l == pytest.approx(5500)
    assert totals.freight_carbon_kg == pytest.approx(4.95)
    assert totals.carbon_intensity_kg_per_kg == pytest.approx((210 + 0.02) / 100)
    assert not any("footprint" in notice for notice in quote.notices)


def test_a_line_with_no_footprint_is_named_and_left_out() -> None:
    catalogue = load_catalogue("bree-216", 1)
    service = next(line for line in catalogue.lines if line.service)
    quote = compute_quote(
        catalogue,
        {PLATE: 500, service.sku: 9_000},
        [QuoteLineIn(sku=PLATE, quantity=100), QuoteLineIn(sku=service.sku, quantity=1)],
    )
    assert quote.totals.embodied_energy_mj == 2400
    assert quote.totals.carbon_kg is None
    assert any(
        service.sku in notice and "energy total" in notice for notice in quote.notices
    )


def test_shop_time_alone_has_carbon_and_no_intensity() -> None:
    catalogue = load_catalogue("bree-216", 3)
    quote = compute_quote(
        catalogue,
        list_prices(catalogue),
        [QuoteLineIn(sku=CNC, quantity=2)],
    )
    assert quote.totals.carbon_kg == pytest.approx(0.04)
    assert quote.totals.embodied_energy_mj == pytest.approx(108)
    assert quote.totals.water_l is None
    assert quote.totals.total_mass_grams == 0
    assert quote.totals.freight_carbon_kg is None
    assert quote.totals.carbon_intensity_kg_per_kg is None
    assert quote.totals.cost_per_kg_cents is None
