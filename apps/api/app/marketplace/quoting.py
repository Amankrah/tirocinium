"""Quote arithmetic (milestone 10.3, decision 0076).

A pure function from a basket to a priced quotation: minimum orders enforced,
volume breaks applied, cut fees added, freight estimated on consolidated mass,
and tax on the lot. Nothing here touches a database or a clock, so the whole of
it is testable against hand-worked figures, which is what the phase gate does.

The footprint is the same kind of figure (decision 0110): each line's per-unit
energy, carbon and water, times the quantity quoted. A line that publishes
none is left out and named. Road-freight carbon is a separate boundary and is
stated only when the basket has a cradle-to-gate carbon total to set it beside.

Money is integer cents everywhere. Mass is integer grams. The one float is a
quantity, because a student may genuinely want 12.5 metres of pipe.
"""

from dataclasses import dataclass

from pydantic import BaseModel, Field

from app.marketplace.catalogue import UNIT_LABELS, Catalogue, CatalogueLine
from app.marketplace.impact import (
    carbon_per_unit,
    embodied_energy_per_unit,
    freight_carbon_kg,
    water_per_unit,
)

MAX_LINES = 60
MAX_CUTS = 50


class QuoteLineIn(BaseModel):
    """One basket line as the student asked for it."""

    sku: str = Field(min_length=1, max_length=64)
    quantity: float = Field(gt=0, le=1_000_000)
    cut_to_length: bool = False
    cut_count: int = Field(default=1, ge=1, le=MAX_CUTS)


class ComputedLine(BaseModel):
    """One priced line. Every field here is snapshotted on issue, because a
    quotation has to read back identically after the catalogue moves."""

    position: int
    sku: str
    supplier_id: str
    supplier_name: str
    name: str
    spec: str
    unit: str
    unit_label: str
    requested_quantity: float
    quantity: float
    list_price_cents: int
    unit_price_cents: int
    break_percent: int
    extended_cents: int
    cut_to_length: bool
    cut_count: int
    cut_fee_cents: int
    mass_grams: int
    lead_days: int
    # This line's contribution to the basket footprint, quantity times the
    # per-unit figure. Null when the line does not publish one.
    embodied_energy_mj: float | None = None
    carbon_kg: float | None = None
    water_l: float | None = None


class TaxLine(BaseModel):
    code: str
    rate: float
    amount_cents: int


class QuoteTotals(BaseModel):
    line_count: int
    supplier_count: int
    goods_cents: int
    discount_cents: int
    cut_fee_cents: int
    freight_cents: int
    taxes: list[TaxLine]
    tax_cents: int
    total_cents: int
    total_mass_grams: int
    longest_lead_days: int
    # Null rather than zero when nothing in the basket has a mass, which is
    # every basket made only of shop hours. An empty denominator is "we cannot
    # say", never a figure that reads like a finding (decision 0048).
    cost_per_kg_cents: int | None
    # Null when no quoted line publishes that figure. Freight carbon is also
    # null unless the basket has a cradle-to-gate carbon total: the road figure
    # is only meaningful beside it, and it is never folded into it.
    embodied_energy_mj: float | None = None
    carbon_kg: float | None = None
    water_l: float | None = None
    freight_carbon_kg: float | None = None
    carbon_intensity_kg_per_kg: float | None = None


class ComputedQuote(BaseModel):
    lines: list[ComputedLine]
    totals: QuoteTotals
    # Things the student should know were done to their basket, in their own
    # terms. A minimum order silently applied is a number they cannot explain
    # in a defence.
    notices: list[str]


def break_percent(catalogue: Catalogue, line: CatalogueLine, quantity: float) -> int:
    """The volume discount this quantity reaches, as whole percent.

    Services do not discount: a shop hour is a shop hour, and pretending
    otherwise would teach that labour scales like tonnage.
    """
    if line.service:
        return 0
    reached = 0
    for threshold, percent in catalogue.price_breaks.get(line.unit, []):
        if quantity >= threshold:
            reached = percent
    return reached


def compute_quote(
    catalogue: Catalogue,
    prices: dict[str, int],
    requested: list[QuoteLineIn],
) -> ComputedQuote:
    """Price a basket. Unknown SKUs are dropped with a notice rather than
    raising, so one stale line in a resubmitted basket costs the student that
    line and never the quotation."""
    lines: list[ComputedLine] = []
    notices: list[str] = []
    goods = 0
    discount = 0
    cut_fees = 0
    mass_grams = 0
    oversize = False

    for request in requested[:MAX_LINES]:
        line = catalogue.line(request.sku)
        if line is None:
            notices.append(
                f"{request.sku} is not a line in this catalogue and was left off.",
            )
            continue
        supplier = catalogue.supplier(line.supplier)
        unit_label = UNIT_LABELS.get(line.unit, line.unit)

        quantity = request.quantity
        if quantity < line.moq:
            quantity = line.moq
            notices.append(
                f"{line.sku}: quantity raised to the {_number(line.moq)} "
                f"{unit_label} minimum order.",
            )

        price = prices[line.sku]
        percent = break_percent(catalogue, line, quantity)
        unit_price = round(price * (100 - percent) / 100)
        extended = round(unit_price * quantity)
        line_cut_fee = (
            line.cut_fee_cents * request.cut_count
            if request.cut_to_length and line.cut_fee_cents > 0
            else 0
        )
        if request.cut_to_length and line.cut_fee_cents == 0:
            notices.append(
                f"{line.sku} is not sold cut to length, so no cutting charge applies.",
            )
        line_mass = round(line.kg_per_unit * quantity * 1000)
        energy, carbon, water = line_footprint(line, quantity)

        goods += extended + line_cut_fee
        discount += round(price * quantity) - extended
        cut_fees += line_cut_fee
        mass_grams += line_mass
        oversize = oversize or line.oversize

        lines.append(
            ComputedLine(
                position=len(lines) + 1,
                sku=line.sku,
                supplier_id=line.supplier,
                supplier_name=supplier.name if supplier else line.supplier,
                name=line.name,
                spec=line.spec,
                unit=line.unit,
                unit_label=unit_label,
                requested_quantity=request.quantity,
                quantity=quantity,
                list_price_cents=price,
                unit_price_cents=unit_price,
                break_percent=percent,
                extended_cents=extended,
                cut_to_length=request.cut_to_length and line.cut_fee_cents > 0,
                cut_count=request.cut_count,
                cut_fee_cents=line_cut_fee,
                mass_grams=line_mass,
                lead_days=line.lead_days,
                embodied_energy_mj=energy,
                carbon_kg=carbon,
                water_l=water,
            ),
        )

    if len(requested) > MAX_LINES:
        notices.append(
            f"A quotation holds {MAX_LINES} lines; the rest were left off.",
        )

    freight = 0
    if goods > 0:
        freight = catalogue.freight.base_cents
        freight += round(catalogue.freight.per_kg_cents * mass_grams / 1000)
        if oversize:
            freight += catalogue.freight.long_item_cents

    taxable = goods + freight
    taxes = [
        TaxLine(code=tax.code, rate=tax.rate, amount_cents=round(taxable * tax.rate))
        for tax in catalogue.taxes
    ]
    tax_total = sum(tax.amount_cents for tax in taxes)
    footprint = basket_footprint(
        [(line.sku, line.embodied_energy_mj, line.carbon_kg, line.water_l) for line in lines],
        mass_grams,
    )

    totals = QuoteTotals(
        line_count=len(lines),
        supplier_count=len({line.supplier_id for line in lines}),
        goods_cents=goods,
        discount_cents=discount,
        cut_fee_cents=cut_fees,
        freight_cents=freight,
        taxes=taxes,
        tax_cents=tax_total,
        total_cents=goods + freight + tax_total,
        total_mass_grams=mass_grams,
        longest_lead_days=max((line.lead_days for line in lines), default=0),
        cost_per_kg_cents=(round(goods / (mass_grams / 1000)) if mass_grams else None),
        embodied_energy_mj=footprint.embodied_energy_mj,
        carbon_kg=footprint.carbon_kg,
        water_l=footprint.water_l,
        freight_carbon_kg=footprint.freight_carbon_kg,
        carbon_intensity_kg_per_kg=footprint.carbon_intensity_kg_per_kg,
    )
    notices.extend(footprint.notices)
    return ComputedQuote(lines=lines, totals=totals, notices=notices)


def line_footprint(
    line: CatalogueLine | None, quantity: float
) -> tuple[float | None, float | None, float | None]:
    """One line's energy, carbon and water at a quoted quantity."""
    if line is None:
        return None, None, None
    return (
        _times(embodied_energy_per_unit(line), quantity),
        _times(carbon_per_unit(line), quantity),
        _times(water_per_unit(line), quantity),
    )


def _times(value: float | None, quantity: float) -> float | None:
    return None if value is None else value * quantity


@dataclass(frozen=True)
class BasketFootprint:
    embodied_energy_mj: float | None
    carbon_kg: float | None
    water_l: float | None
    freight_carbon_kg: float | None
    carbon_intensity_kg_per_kg: float | None
    notices: tuple[str, ...]


def basket_footprint(
    contributions: list[tuple[str, float | None, float | None, float | None]],
    mass_grams: int,
) -> BasketFootprint:
    """Sum the lines that publish a figure. A line that publishes none of the
    three is named, and only when the basket did sum something: a basket with
    no footprint at all says so by leaving the totals null."""
    energy = _sum_present([item[1] for item in contributions])
    carbon = _sum_present([item[2] for item in contributions])
    water = _sum_present([item[3] for item in contributions])
    omitted = [
        sku
        for sku, line_energy, line_carbon, line_water in contributions
        if line_energy is None and line_carbon is None and line_water is None
    ]
    indicators = [
        name
        for name, total in (("energy", energy), ("carbon", carbon), ("water", water))
        if total is not None
    ]
    notices: tuple[str, ...] = ()
    if omitted and indicators:
        notices = (_omission(omitted, indicators),)
    intensity = None if carbon is None or mass_grams <= 0 else carbon / (mass_grams / 1000)
    return BasketFootprint(
        embodied_energy_mj=energy,
        carbon_kg=carbon,
        water_l=water,
        freight_carbon_kg=freight_carbon_kg(mass_grams) if carbon is not None else None,
        carbon_intensity_kg_per_kg=intensity,
        notices=notices,
    )


def _sum_present(values: list[float | None]) -> float | None:
    present = [value for value in values if value is not None]
    if not present:
        return None
    return float(sum(present))


def _omission(skus: list[str], indicators: list[str]) -> str:
    subject = skus[0] if len(skus) == 1 else ", ".join(skus)
    verb = "has" if len(skus) == 1 else "have"
    if len(indicators) == 1:
        totals = f"the {indicators[0]} total leaves"
    else:
        listed = ", ".join(indicators[:-1]) + " and " + indicators[-1]
        totals = f"the {listed} totals leave"
    pronoun = "it" if len(skus) == 1 else "them"
    return f"{subject} {verb} no published footprint, so {totals} {pronoun} out."


def _number(value: float) -> str:
    """Render a quantity the way the catalogue writes it: 25 rather than 25.0,
    but 0.33 kept whole."""
    return str(int(value)) if value == int(value) else str(value)
