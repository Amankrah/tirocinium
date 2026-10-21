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
from app.marketplace.indices import STOCK_LABELS, price_per_kg_cents

DEFAULT_LIMIT = 24
MAX_LIMIT = 96
SORT_PATTERN = "^(relevance|price_asc|price_desc|lead|name)$"


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


class LineDetail(LineSummary):
    description: str
    fabrication: str
    oversize: bool
    properties: MaterialProperties
    price_breaks: list[tuple[float, int]]
    supplier: Supplier


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
    return LineDetail(
        **line_summary(catalogue, prices, line, shortlist).model_dump(),
        description=line.description,
        fabrication=line.fabrication,
        oversize=line.oversize,
        properties=line.properties,
        price_breaks=([] if line.service else list(catalogue.price_breaks.get(line.unit, []))),
        supplier=supplier,
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


def select_lines(
    catalogue: Catalogue,
    prices: dict[str, int],
    *,
    supplier: str | None,
    category: str | None,
    tag: str | None,
    q: str | None,
    sort: str,
    cursor: int,
    limit: int,
    shortlist: Sequence[str] = (),
) -> LineListOut:
    """Filter, sort and page the catalogue. Filtering narrows and never
    restricts: every line stays reachable, because deciding that a material is
    wrong is the exercise."""
    needle = (q or "").strip().casefold()
    matched = [
        line
        for line in catalogue.lines
        if (supplier is None or line.supplier == supplier)
        and (category is None or line.category == category)
        and (tag is None or tag in line.tags)
        and (
            not needle
            or needle in line.name.casefold()
            or needle in line.sku.casefold()
            or needle in line.spec.casefold()
            or needle in line.category.casefold()
            or any(needle in item.casefold() for item in line.tags)
        )
    ]

    if sort == "price_asc":
        matched.sort(key=lambda line: prices[line.sku])
    elif sort == "price_desc":
        matched.sort(key=lambda line: prices[line.sku], reverse=True)
    elif sort == "lead":
        matched.sort(key=lambda line: line.lead_days)
    elif sort == "name":
        matched.sort(key=lambda line: line.name)
    else:
        # Relevance is the shortlist in the order it was put in (that order is
        # the point of authoring one), then the catalogue's own order. With no
        # shortlist it is simply the catalogue's order.
        rank = {sku: position for position, sku in enumerate(shortlist)}
        matched.sort(key=lambda line: rank.get(line.sku, len(rank)))

    window = matched[cursor : cursor + limit]
    following = cursor + limit
    return LineListOut(
        items=[line_summary(catalogue, prices, line, shortlist) for line in window],
        next_cursor=following if following < len(matched) else None,
        total=len(matched),
    )
