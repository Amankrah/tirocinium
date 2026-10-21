"""Reading the catalogue at a set of prices (decisions 0076 and 0100).

Two surfaces browse the same catalogue. The case-study marketplace prices every
line from the variant's seed; the project marketplace prices at the
catalogue's list prices. Everything else about reading a line, listing and
sorting them, and summarising a supplier is the same, so it lives here as pure
functions over (catalogue, prices) and neither surface knows the other exists.
"""

from collections.abc import Sequence

from pydantic import BaseModel

from app.marketplace.catalogue import (
    UNIT_LABELS,
    Catalogue,
    CatalogueLine,
    MaterialProperties,
    Supplier,
)
from app.marketplace.indices import (
    STOCK_LABELS,
    cost_per_litre_cents,
    price_per_kg_cents,
    specific_stiffness,
    specific_strength,
    strength_per_dollar,
)

DEFAULT_LIMIT = 24
MAX_LIMIT = 96
SORT_PATTERN = (
    "^(relevance|price_asc|price_desc|lead|name|per_kg_asc|density_asc|yield_desc)$"
)
RELATED_LIMIT = 4


class LineSummary(BaseModel):
    """A catalogue line as a card: enough to compare on, not enough to
    specify from."""

    sku: str
    supplier_id: str
    supplier_name: str
    category: str
    name: str
    spec: str
    unit: str
    unit_label: str
    price_cents: int
    price_per_kg_cents: float | None
    moq: float
    lead_days: int
    stock: str
    stock_label: str
    cut_fee_cents: int
    swatch: str
    tags: list[str]
    service: bool
    shortlisted: bool


class LineIndices(BaseModel):
    """The derived selection indices for one line at these prices, from the
    same functions the comparison uses, so the line page and the comparison
    can never disagree. Each is None where the line has nothing to divide."""

    specific_strength: float | None  # kN·m/kg
    specific_stiffness: float | None  # kN·m/kg
    strength_per_dollar: float | None
    cost_per_litre_cents: float | None


class LineDetail(LineSummary):
    kg_per_unit: float
    indices: LineIndices
    description: str
    fabrication: str
    oversize: bool
    properties: MaterialProperties
    price_breaks: list[tuple[float, int]]
    supplier: Supplier
    # Lines a buyer would weigh against this one: the same category, or a
    # shared attribute, in catalogue order. Alternatives, never a verdict.
    related: list[LineSummary] = []


class LineListOut(BaseModel):
    items: list[LineSummary]
    next_cursor: int | None
    total: int


class SupplierSummary(BaseModel):
    supplier: Supplier
    line_count: int
    categories: list[str]
    from_price_cents: int


def list_prices(catalogue: Catalogue) -> dict[str, int]:
    """Every line at its authored list price: what any buyer is quoted before
    a market moves it (decision 0100)."""
    return {line.sku: line.list_price_cents for line in catalogue.lines}


def line_summary(
    catalogue: Catalogue,
    prices: dict[str, int],
    line: CatalogueLine,
    shortlist: Sequence[str] = (),
) -> LineSummary:
    supplier = catalogue.supplier(line.supplier)
    price = prices[line.sku]
    return LineSummary(
        sku=line.sku,
        supplier_id=line.supplier,
        supplier_name=supplier.name if supplier else line.supplier,
        category=line.category,
        name=line.name,
        spec=line.spec,
        unit=line.unit,
        unit_label=UNIT_LABELS.get(line.unit, line.unit),
        price_cents=price,
        price_per_kg_cents=price_per_kg_cents(line, price),
        moq=line.moq,
        lead_days=line.lead_days,
        stock=line.stock,
        stock_label=STOCK_LABELS.get(line.stock, line.stock),
        cut_fee_cents=line.cut_fee_cents,
        swatch=line.swatch,
        tags=line.tags,
        service=line.service,
        shortlisted=line.sku in shortlist,
    )


def line_detail(
    catalogue: Catalogue,
    prices: dict[str, int],
    sku: str,
    shortlist: Sequence[str] = (),
) -> LineDetail | None:
    """A line in full, or None when the SKU or its supplier is unknown."""
    line = catalogue.line(sku)
    supplier = catalogue.supplier(line.supplier) if line else None
    if line is None or supplier is None:
        return None
    related = [
        other
        for other in catalogue.lines
        if other.sku != line.sku
        and (other.category == line.category or set(other.tags) & set(line.tags))
    ][:RELATED_LIMIT]
    return LineDetail(
        **line_summary(catalogue, prices, line, shortlist).model_dump(),
        kg_per_unit=line.kg_per_unit,
        indices=LineIndices(
            specific_strength=specific_strength(line),
            specific_stiffness=specific_stiffness(line),
            strength_per_dollar=strength_per_dollar(line, prices[line.sku]),
            cost_per_litre_cents=cost_per_litre_cents(line, prices[line.sku]),
        ),
        description=line.description,
        fabrication=line.fabrication,
        oversize=line.oversize,
        properties=line.properties,
        price_breaks=([] if line.service else list(catalogue.price_breaks.get(line.unit, []))),
        supplier=supplier,
        related=[line_summary(catalogue, prices, other, shortlist) for other in related],
    )


def supplier_summaries(catalogue: Catalogue, prices: dict[str, int]) -> list[SupplierSummary]:
    return [
        SupplierSummary(
            supplier=supplier,
            line_count=len(lines),
            categories=catalogue.categories_for(supplier.id),
            from_price_cents=min(prices[line.sku] for line in lines),
        )
        for supplier in catalogue.suppliers
        if (lines := catalogue.lines_for(supplier.id))
    ]


def _last_if_none(value: float | None, *, descending: bool = False) -> tuple[bool, float]:
    """Sort key that puts a missing figure last whichever way the sort runs:
    a service has no density, and it should not head a density ranking."""
    if value is None:
        return (True, 0.0)
    return (False, -value if descending else value)


def select_lines(
    catalogue: Catalogue,
    prices: dict[str, int],
    *,
    supplier: str | None,
    category: Sequence[str] | None,
    tag: Sequence[str] | None,
    q: str | None,
    sort: str,
    cursor: int,
    limit: int,
    shortlist: Sequence[str] = (),
    skus: Sequence[str] | None = None,
) -> LineListOut:
    """Filter, sort and page the catalogue. Filtering narrows and never
    restricts: every line stays reachable, because deciding that a material is
    wrong is the exercise.

    Within a group the filters are alternatives (any ticked category, any
    ticked attribute); across groups they combine. `skus` asks for exactly
    those lines, in the order given, which is how a brief's shortlist or a
    featured set is read."""
    needle = (q or "").strip().casefold()
    categories = set(category or ())
    tags = set(tag or ())

    def matches(line: CatalogueLine) -> bool:
        if not needle:
            return True
        found = catalogue.supplier(line.supplier)
        haystack = (
            line.name,
            line.sku,
            line.spec,
            line.category,
            line.description,
            found.name if found else line.supplier,
            *line.tags,
        )
        return any(needle in field.casefold() for field in haystack)

    if skus is not None:
        pool = [found for sku in skus if (found := catalogue.line(sku)) is not None]
    else:
        pool = list(catalogue.lines)

    matched = [
        line
        for line in pool
        if (supplier is None or line.supplier == supplier)
        and (not categories or line.category in categories)
        and (not tags or tags.intersection(line.tags))
        and matches(line)
    ]

    if sort == "price_asc":
        matched.sort(key=lambda line: prices[line.sku])
    elif sort == "price_desc":
        matched.sort(key=lambda line: prices[line.sku], reverse=True)
    elif sort == "lead":
        matched.sort(key=lambda line: line.lead_days)
    elif sort == "name":
        matched.sort(key=lambda line: line.name)
    elif sort == "per_kg_asc":
        matched.sort(key=lambda line: _last_if_none(price_per_kg_cents(line, prices[line.sku])))
    elif sort == "density_asc":
        matched.sort(key=lambda line: _last_if_none(line.properties.density_kg_m3))
    elif sort == "yield_desc":
        matched.sort(
            key=lambda line: _last_if_none(line.properties.yield_strength_mpa, descending=True)
        )
    elif skus is None:
        # Relevance is the shortlist in the order it was put in (that order is
        # the point of authoring one), then the catalogue's own order. With no
        # shortlist it is simply the catalogue's order; with an explicit list
        # of SKUs it is the list's own order.
        rank = {sku: position for position, sku in enumerate(shortlist)}
        matched.sort(key=lambda line: rank.get(line.sku, len(rank)))

    window = matched[cursor : cursor + limit]
    following = cursor + limit
    return LineListOut(
        items=[line_summary(catalogue, prices, line, shortlist) for line in window],
        next_cursor=following if following < len(matched) else None,
        total=len(matched),
    )
