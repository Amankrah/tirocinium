"""Quote arithmetic (milestone 10.3, decision 0062).

A pure function from a basket to a priced quotation: minimum orders enforced,
volume breaks applied, cut fees added, freight estimated on consolidated mass,
and tax on the lot. Nothing here touches a database or a clock, so the whole of
it is testable against hand-worked figures, which is what the phase gate does.

Money is integer cents everywhere. Mass is integer grams. The one float is a
quantity, because a student may genuinely want 12.5 metres of pipe.
"""

from pydantic import BaseModel, Field

from app.marketplace.catalogue import UNIT_LABELS, Catalogue, CatalogueLine

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
    )
    return ComputedQuote(lines=lines, totals=totals, notices=notices)


def _number(value: float) -> str:
    """Render a quantity the way the catalogue writes it: 25 rather than 25.0,
    but 0.33 kept whole."""
    return str(int(value)) if value == int(value) else str(value)
