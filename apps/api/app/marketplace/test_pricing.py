"""Seeded prices and quote arithmetic (milestones 10.2 and 10.3).

Three properties carry these milestones. A price is reproducible from its seed,
because a stored quotation is evidence and evidence that cannot be recomputed is
an assertion. Two seats never hold the same price list, because that is the
whole anti-collusion argument for pricing per variant. And the arithmetic
matches figures worked by hand, because a total a student cannot follow is a
total they cannot defend.
"""

import pytest

from app.marketplace.advice import Certification, Environment, RfqIn, Volume, advise
from app.marketplace.catalogue import Catalogue, CatalogueLine, load_catalogue
from app.marketplace.indices import specific_strength, strength_per_dollar
from app.marketplace.pricing import (
    line_price_cents,
    orders_are_stable,
    price_band_cents,
    variant_prices,
)
from app.marketplace.quoting import QuoteLineIn, break_percent, compute_quote

PLATE = "LMS-A36-PL06"


@pytest.fixture(scope="module")
def catalogue() -> Catalogue:
    return load_catalogue("bree-216", 1)


# ------------------------------------------------------------------ pricing


def test_price_is_reproducible_from_the_seed(catalogue: Catalogue) -> None:
    line = catalogue.line(PLATE)
    assert line is not None
    assert line_price_cents(line, 4242) == line_price_cents(line, 4242)


def test_prices_are_identical_across_processes(catalogue: Catalogue) -> None:
    """The figures, pinned.

    Reproducibility within one run only proves the function is a function. What
    a stored quotation needs is that seed 4242 means the same cents next year,
    in another interpreter, after a Python upgrade, which is why the draw comes
    off a SHA-256 slice and not off `random.Random(str)`. These four are the
    contract; changing them is a catalogue version, not a patch.
    """
    expected = {
        "LMS-A36-PL06": 505,
        "BSA-316L-2B": 1425,
        "CPP-HDPE-100": 2981,
        "MFW-CNC3-HR": 9378,
    }
    for sku, cents in expected.items():
        line = catalogue.line(sku)
        assert line is not None
        assert line_price_cents(line, 4242) == cents, sku


def test_price_stays_inside_the_authored_band(catalogue: Catalogue) -> None:
    """Every line, every seed in a wide sweep. The band is what the professor's
    authoring view promises, so it has to be a bound and not a hope."""
    for line in catalogue.lines:
        low, high = price_band_cents(line)
        for seed in range(200):
            assert low <= line_price_cents(line, seed) <= high, line.sku


def test_no_line_is_ever_free(catalogue: Catalogue) -> None:
    for line in catalogue.lines:
        assert all(line_price_cents(line, seed) >= 1 for seed in range(200))


def test_two_seats_do_not_hold_the_same_price_list(catalogue: Catalogue) -> None:
    """The anti-collusion property. Not every line has to move (a zero-
    volatility shop rate must not), but the lists as a whole must differ."""
    first = variant_prices(catalogue, 1001)
    second = variant_prices(catalogue, 1002)
    assert first != second
    moved = sum(1 for sku, price in first.items() if second[sku] != price)
    assert moved > len(first) // 2


def test_a_zero_volatility_line_is_the_list_price(catalogue: Catalogue) -> None:
    """No shipped line is flat (even a shop rate moves a little year to year),
    so this pins the guard rather than the catalogue: a future line authored at
    zero must come back at its list price, not at a rounded draw of it."""
    line = catalogue.line(PLATE)
    assert line is not None
    flat = line.model_copy(update={"volatility": 0.0})
    assert line_price_cents(flat, 7) == flat.list_price_cents


def test_shop_time_is_the_steadiest_thing_in_the_catalogue(
    catalogue: Catalogue,
) -> None:
    """The volatility bands carry a claim about the trade: labour is the least
    exposed price on the sheet, and an alloy surcharge is the most."""
    services = [line.volatility for line in catalogue.lines if line.service]
    materials = [line.volatility for line in catalogue.lines if not line.service]
    assert max(services) < max(materials)
    assert sum(services) / len(services) < sum(materials) / len(materials)


def test_adding_a_line_cannot_move_another_line(catalogue: Catalogue) -> None:
    """Each draw is independent of the rest of the catalogue, which is what
    lets version 2 add a SKU without repricing version 1's quotations."""
    line = catalogue.line(PLATE)
    assert line is not None
    alone = line_price_cents(line, 99)
    assert variant_prices(catalogue, 99)[PLATE] == alone


def test_ordering_gate_holds_for_a_pedagogically_load_bearing_pair(
    catalogue: Catalogue,
) -> None:
    """Mild steel plate is cheaper per kilogram than 316L under every seed
    there is. A student who reasons from that comparison must not meet a
    variant where it is false."""
    plate = catalogue.line(PLATE)
    stainless = next(line for line in catalogue.lines if "316" in line.name and line.unit == "kg")
    assert plate is not None
    assert orders_are_stable(plate, stainless)


def test_every_brief_shortlist_keeps_its_cheapest_line_across_a_thousand_seeds(
    catalogue: Catalogue,
) -> None:
    """The corpus check the phase gate names.

    Within one brief's shortlist, comparable lines are what the student reasons
    over, so the cheapest of a comparable pair must not flip with the seed. This
    asserts the weaker, truer thing: for every shortlist, the line the catalogue
    prices lowest stays lowest under a thousand seeds unless its band genuinely
    overlaps the runner-up's. An overlap is not a defect (galvanised steel and
    aluminium really do trade places per metre), so when one exists the pair is
    named and skipped rather than the test being weakened everywhere.
    """
    for brief in catalogue.briefs:
        lines = [line for sku in brief.shortlist if (line := catalogue.line(sku)) is not None]
        by_unit: dict[str, list[CatalogueLine]] = {}
        for line in lines:
            by_unit.setdefault(line.unit, []).append(line)
        for unit, group in by_unit.items():
            if len(group) < 2:
                continue
            ranked = sorted(group, key=lambda line: line.list_price_cents)
            cheapest, runner_up = ranked[0], ranked[1]
            if not orders_are_stable(cheapest, runner_up):
                continue
            for seed in range(1000):
                assert line_price_cents(cheapest, seed) < line_price_cents(runner_up, seed), (
                    f"{brief.id} ({unit}): {cheapest.sku} vs {runner_up.sku} at seed {seed}"
                )


# ------------------------------------------------------------- quote totals


def test_minimum_order_is_applied_and_said_out_loud(catalogue: Catalogue) -> None:
    """The notice matters as much as the number: a quantity silently raised is
    a figure the student cannot account for in a defence."""
    prices = {PLATE: 500}
    quote = compute_quote(catalogue, prices, [QuoteLineIn(sku=PLATE, quantity=1)])
    assert quote.lines[0].requested_quantity == 1
    assert quote.lines[0].quantity == 25
    assert any("minimum order" in notice for notice in quote.notices)


def test_totals_match_a_hand_worked_figure(catalogue: Catalogue) -> None:
    """100 kg of 6 mm plate at a round $5.00/kg, worked on paper.

    Goods reach the 100 kg break at 4 %, so $4.80 x 100 = $480.00. Mass is
    100 kg, so freight is $45.00 base plus $0.85 x 100 = $130.00. Tax is 5 %
    GST and 9.975 % QST on $610.00: $30.50 and $60.85.
    """
    prices = {PLATE: 500}
    quote = compute_quote(catalogue, prices, [QuoteLineIn(sku=PLATE, quantity=100)])
    totals = quote.totals
    assert quote.lines[0].break_percent == 4
    assert quote.lines[0].unit_price_cents == 480
    assert totals.goods_cents == 48_000
    assert totals.discount_cents == 2_000
    assert totals.freight_cents == 4_500 + 8_500
    assert [tax.amount_cents for tax in totals.taxes] == [3_050, 6_085]
    assert totals.total_cents == 48_000 + 13_000 + 3_050 + 6_085
    assert totals.total_mass_grams == 100_000
    assert totals.cost_per_kg_cents == 480


def test_a_break_is_reached_by_quantity_not_by_value(catalogue: Catalogue) -> None:
    line = catalogue.line(PLATE)
    assert line is not None
    assert break_percent(catalogue, line, 99) == 0
    assert break_percent(catalogue, line, 100) == 4
    assert break_percent(catalogue, line, 2_000) == 14


def test_shop_time_does_not_discount(catalogue: Catalogue) -> None:
    """A shop hour is a shop hour. Discounting labour like tonnage would teach
    something false about where fabrication cost comes from."""
    service = next(line for line in catalogue.lines if line.service)
    assert break_percent(catalogue, service, 10_000) == 0


def test_an_unknown_sku_costs_its_line_and_never_the_quotation(
    catalogue: Catalogue,
) -> None:
    prices = {PLATE: 500}
    quote = compute_quote(
        catalogue,
        prices,
        [QuoteLineIn(sku="NOT-A-SKU", quantity=1), QuoteLineIn(sku=PLATE, quantity=25)],
    )
    assert [line.sku for line in quote.lines] == [PLATE]
    assert any("NOT-A-SKU" in notice for notice in quote.notices)


def test_an_empty_basket_is_free_rather_than_freighted(catalogue: Catalogue) -> None:
    quote = compute_quote(catalogue, {}, [])
    assert quote.totals.total_cents == 0
    assert quote.totals.freight_cents == 0


def test_a_massless_basket_reports_no_cost_per_kilogram(catalogue: Catalogue) -> None:
    """Decision 0048: an empty denominator is "we cannot say", never a figure
    that reads like a finding."""
    service = next(line for line in catalogue.lines if line.service)
    quote = compute_quote(
        catalogue,
        {service.sku: 9_000},
        [QuoteLineIn(sku=service.sku, quantity=4)],
    )
    assert quote.totals.total_mass_grams == 0
    assert quote.totals.cost_per_kg_cents is None


def test_cutting_is_charged_only_where_it_is_sold(catalogue: Catalogue) -> None:
    cuttable = next(line for line in catalogue.lines if line.cut_fee_cents > 0)
    quote = compute_quote(
        catalogue,
        {cuttable.sku: 1_000},
        [QuoteLineIn(sku=cuttable.sku, quantity=cuttable.moq, cut_to_length=True, cut_count=3)],
    )
    assert quote.totals.cut_fee_cents == cuttable.cut_fee_cents * 3

    uncut = compute_quote(
        catalogue,
        {PLATE: 500},
        [QuoteLineIn(sku=PLATE, quantity=25, cut_to_length=True, cut_count=3)],
    )
    assert uncut.totals.cut_fee_cents == 0
    assert any("not sold cut to length" in notice for notice in uncut.notices)


def test_an_oversize_line_carries_the_long_item_charge(catalogue: Catalogue) -> None:
    long_line = next(line for line in catalogue.lines if line.oversize)
    quote = compute_quote(
        catalogue,
        {long_line.sku: 1_000},
        [QuoteLineIn(sku=long_line.sku, quantity=long_line.moq)],
    )
    plain = catalogue.freight.base_cents + round(
        catalogue.freight.per_kg_cents * quote.totals.total_mass_grams / 1000
    )
    assert quote.totals.freight_cents == plain + catalogue.freight.long_item_cents


def test_a_basket_is_capped_and_says_so(catalogue: Catalogue) -> None:
    requested = [QuoteLineIn(sku=PLATE, quantity=25) for _ in range(80)]
    quote = compute_quote(catalogue, {PLATE: 500}, requested)
    assert len(quote.lines) == 60
    assert any("60 lines" in notice for notice in quote.notices)


# ------------------------------------------------------------ the rules


def test_the_rules_engine_is_total(catalogue: Catalogue) -> None:
    """Every combination of answers returns at least one note and none throws.

    A vendor who replies with nothing has told the student their request was
    complete, which it rarely is. 240 combinations: every volume, environment
    and certification, with and without a line named.
    """
    for sku in (PLATE, None):
        for volume in Volume:
            for environment in Environment:
                for certification in Certification:
                    advice = advise(
                        catalogue,
                        RfqIn(
                            sku=sku,
                            volume=volume,
                            environment=environment,
                            certification=certification,
                        ),
                    )
                    assert advice.notes, (sku, volume, environment, certification)
                    assert all(note.text.strip() for note in advice.notes)


def test_a_service_line_is_answered_as_a_process_not_a_material(
    catalogue: Catalogue,
) -> None:
    service = next(line for line in catalogue.lines if line.service)
    advice = advise(catalogue, RfqIn(sku=service.sku, quantity="4 hr"))
    assert "service-only-basket" in {note.rule for note in advice.notes}
    assert advice.missing == []


# ---------------------------------------------------------------- indices


def test_specific_strength_normalises_by_density(catalogue: Catalogue) -> None:
    """The index that makes aluminium arguable against steel. 250 MPa over
    7850 kg/m3 is 31.8 kN.m/kg, worked on paper."""
    plate = catalogue.line(PLATE)
    assert plate is not None
    value = specific_strength(plate)
    assert value is not None
    assert value == pytest.approx(31.8, abs=0.1)


def test_strength_per_dollar_moves_with_the_seeded_price(catalogue: Catalogue) -> None:
    """The one index that is not a property of the material alone, which is
    exactly why it belongs in a marketplace and not in a data sheet."""
    plate = catalogue.line(PLATE)
    assert plate is not None
    cheap = strength_per_dollar(plate, 400)
    dear = strength_per_dollar(plate, 800)
    assert cheap is not None and dear is not None
    assert cheap > dear
