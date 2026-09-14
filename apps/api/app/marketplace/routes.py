"""The student's marketplace (milestones 10.3 and 10.4, decision 0062).

Every surface here is seat-only and scoped to one variant, because a price on
this platform is a property of a line and a variant together. A student working
the base case study because the pool was dry has no variant and therefore no
marketplace; that is the honest answer rather than a shared price list, and the
pool invariant makes it rare.

The catalogue is a file asset, so browsing costs no query. What reaches SQLite
is only what the student made: their baskets, their quotations, and the requests
they sent.
"""

import json
import sqlite3
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.auth.deps import get_shards, require_seat
from app.auth.models import Identity
from app.compression import compress_bytes, decompress_bytes
from app.db.shards import ShardManager
from app.marketplace.advice import RfqAdvice, RfqIn, advise
from app.marketplace.catalogue import (
    UNIT_LABELS,
    Brief,
    Catalogue,
    CatalogueLine,
    Freight,
    MaterialProperties,
    Supplier,
    Tax,
    load_catalogue,
)
from app.marketplace.indices import (
    MAX_COMPARE,
    STOCK_LABELS,
    CompareOut,
    compare,
    price_per_kg_cents,
)
from app.marketplace.pricing import variant_prices
from app.marketplace.quoting import (
    MAX_LINES,
    ComputedLine,
    ComputedQuote,
    QuoteLineIn,
    QuoteTotals,
    TaxLine,
    compute_quote,
)
from app.problems import Problem

router = APIRouter(prefix="/api/v1", tags=["marketplace"])

DEFAULT_LIMIT = 24
MAX_LIMIT = 96
MAX_DRAFTS = 12

NO_CATALOGUE = (
    "This course does not quote for materials. Your professor turns the marketplace on per course."
)


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------


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


class MarketplaceOut(BaseModel):
    """The front door: who trades here, what this case study points at, and the
    terms every quotation is struck on."""

    variant_id: int
    case_study_id: int
    case_study_title: str
    catalogue_id: str
    catalogue_version: int
    title: str
    course_note: str
    currency: str
    quote_validity_days: int
    taxes: list[Tax]
    freight: Freight
    suppliers: list[SupplierSummary]
    categories: list[str]
    shortlist: list[LineSummary]
    brief: Brief | None


class QuoteOut(BaseModel):
    id: int
    variant_id: int
    status: str
    quote_number: str | None
    catalogue_id: str
    catalogue_version: int
    created_at: int
    issued_at: int | None
    valid_until: int | None
    lines: list[ComputedLine]
    totals: QuoteTotals
    notices: list[str]


class QuoteSummary(BaseModel):
    id: int
    status: str
    quote_number: str | None
    line_count: int
    total_cents: int
    created_at: int
    issued_at: int | None


class QuoteListOut(BaseModel):
    items: list[QuoteSummary]


class QuoteIn(BaseModel):
    lines: list[QuoteLineIn] = Field(default_factory=list, max_length=MAX_LINES)


class CompareIn(BaseModel):
    skus: list[str] = Field(min_length=1, max_length=MAX_COMPARE)


class RfqOut(BaseModel):
    id: int
    reference: str
    created_at: int
    request: RfqIn
    advice: RfqAdvice


# ---------------------------------------------------------------------------
# Context
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class _Context:
    """Everything a marketplace call needs, resolved once: who is asking, which
    variant they are quoting against, and at what prices.

    A dataclass rather than a model because nothing here crosses the wire and
    the catalogue is large: revalidating it per request would copy the whole
    asset to learn what the loader already proved.
    """

    course_id: int
    seat_id: int
    variant_id: int
    case_study_id: int
    case_study_title: str
    seed: int
    catalogue: Catalogue
    prices: dict[str, int]
    shortlist: list[str]


def _seat(identity: Identity) -> tuple[int, int]:
    assert identity.course_id is not None
    assert identity.seat_id is not None
    return identity.course_id, identity.seat_id


async def _catalogue_pin(shards: ShardManager, course_id: int) -> tuple[str, int]:
    """The catalogue this course quotes against, or a 409 saying the course
    does not quote. A 409 rather than a 404 because the course exists and the
    marketplace is a setting on it."""

    def read(conn: sqlite3.Connection) -> tuple[str, int] | None:
        row = conn.execute(
            "SELECT catalogue_id, catalogue_version FROM courses WHERE id = ?",
            (course_id,),
        ).fetchone()
        if row is None or row[0] is None or row[1] is None:
            return None
        return str(row[0]), int(row[1])

    pin = await shards.directory_reads.run(read)
    if pin is None:
        raise HTTPException(status_code=409, detail=NO_CATALOGUE)
    return pin


async def _context(
    shards: ShardManager,
    identity: Identity,
    variant_id: int,
) -> _Context:
    course_id, seat_id = _seat(identity)
    catalogue_id, version = await _catalogue_pin(shards, course_id)

    def read(conn: sqlite3.Connection) -> tuple[int, int, str, list[str]]:
        row = conn.execute(
            "SELECT v.seed, v.case_study_id, cs.title, cs.status, v.verification"
            " FROM variants v JOIN case_studies cs ON cs.id = v.case_study_id"
            " WHERE v.id = ?",
            (variant_id,),
        ).fetchone()
        # A seat meets variants only through the pool, so an unpublished case
        # study or a flagged variant is a 404 and not a 403: existence must not
        # leak through the marketplace any more than it does through practice.
        if row is None or str(row[3]) != "published" or str(row[4]) == "flagged":
            raise HTTPException(status_code=404, detail="Variant not found.")
        shortlist = [
            str(item[0])
            for item in conn.execute(
                "SELECT sku FROM case_study_shortlist WHERE case_study_id = ? ORDER BY position",
                (int(row[1]),),
            ).fetchall()
        ]
        # Variants predating migration 0015 carry no seed. Falling back to the
        # variant id keeps prices deterministic and per-student rather than
        # refusing the marketplace to a course with legacy rows.
        seed = int(row[0]) if row[0] is not None else variant_id
        return seed, int(row[1]), str(row[2]), shortlist

    seed, case_study_id, title, shortlist = await shards.course_reads(course_id).run(read)
    catalogue = load_catalogue(catalogue_id, version)
    return _Context(
        course_id=course_id,
        seat_id=seat_id,
        variant_id=variant_id,
        case_study_id=case_study_id,
        case_study_title=title,
        seed=seed,
        catalogue=catalogue,
        prices=variant_prices(catalogue, seed),
        shortlist=shortlist,
    )


def _summary(context: _Context, line: CatalogueLine) -> LineSummary:
    supplier = context.catalogue.supplier(line.supplier)
    price = context.prices[line.sku]
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
        shortlisted=line.sku in context.shortlist,
    )


# ---------------------------------------------------------------------------
# Browsing
# ---------------------------------------------------------------------------


@router.get(
    "/variants/{variant_id}/marketplace",
    response_model=MarketplaceOut,
    responses={403: {"model": Problem}, 404: {"model": Problem}, 409: {"model": Problem}},
)
async def get_marketplace(
    variant_id: int,
    identity: Annotated[Identity, Depends(require_seat)],
    shards: Annotated[ShardManager, Depends(get_shards)],
) -> MarketplaceOut:
    """The supplier directory and this case study's shortlist, at this
    variant's prices."""
    context = await _context(shards, identity, variant_id)
    catalogue = context.catalogue

    suppliers = [
        SupplierSummary(
            supplier=supplier,
            line_count=len(lines),
            categories=catalogue.categories_for(supplier.id),
            from_price_cents=min(context.prices[line.sku] for line in lines),
        )
        for supplier in catalogue.suppliers
        if (lines := catalogue.lines_for(supplier.id))
    ]
    shortlist = [
        _summary(context, line)
        for sku in context.shortlist
        if (line := catalogue.line(sku)) is not None
    ]
    # The brief is a reading aid, matched by title, and its absence is ordinary:
    # a case study the professor wrote themselves has no brief in the shipped
    # catalogue, and the shortlist is the authoritative pointer either way.
    brief = next(
        (b for b in catalogue.briefs if b.title.casefold() == context.case_study_title.casefold()),
        None,
    )
    return MarketplaceOut(
        variant_id=variant_id,
        case_study_id=context.case_study_id,
        case_study_title=context.case_study_title,
        catalogue_id=catalogue.id,
        catalogue_version=catalogue.version,
        title=catalogue.title,
        course_note=catalogue.course_note,
        currency=catalogue.currency,
        quote_validity_days=catalogue.quote_validity_days,
        taxes=catalogue.taxes,
        freight=catalogue.freight,
        suppliers=suppliers,
        categories=sorted({line.category for line in catalogue.lines}),
        shortlist=shortlist,
        brief=brief,
    )


@router.get(
    "/variants/{variant_id}/marketplace/lines",
    response_model=LineListOut,
    responses={403: {"model": Problem}, 404: {"model": Problem}, 409: {"model": Problem}},
)
async def list_lines(
    variant_id: int,
    identity: Annotated[Identity, Depends(require_seat)],
    shards: Annotated[ShardManager, Depends(get_shards)],
    supplier: Annotated[str | None, Query()] = None,
    category: Annotated[str | None, Query()] = None,
    tag: Annotated[str | None, Query()] = None,
    q: Annotated[str | None, Query(max_length=100)] = None,
    sort: Annotated[
        str, Query(pattern="^(relevance|price_asc|price_desc|lead|name)$")
    ] = "relevance",
    cursor: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=MAX_LIMIT)] = DEFAULT_LIMIT,
) -> LineListOut:
    """Browse the catalogue. Filtering narrows and never restricts: every line
    stays reachable, because deciding that a material is wrong is the
    exercise."""
    context = await _context(shards, identity, variant_id)
    needle = (q or "").strip().casefold()

    matched = [
        line
        for line in context.catalogue.lines
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
        matched.sort(key=lambda line: context.prices[line.sku])
    elif sort == "price_desc":
        matched.sort(key=lambda line: context.prices[line.sku], reverse=True)
    elif sort == "lead":
        matched.sort(key=lambda line: line.lead_days)
    elif sort == "name":
        matched.sort(key=lambda line: line.name)
    else:
        # Relevance is the professor's shortlist in the order they put it in
        # (that order is the point of authoring one), then the catalogue's own
        # order for everything else.
        rank = {sku: position for position, sku in enumerate(context.shortlist)}
        matched.sort(key=lambda line: rank.get(line.sku, len(rank)))

    window = matched[cursor : cursor + limit]
    following = cursor + limit
    return LineListOut(
        items=[_summary(context, line) for line in window],
        next_cursor=following if following < len(matched) else None,
        total=len(matched),
    )


@router.get(
    "/variants/{variant_id}/marketplace/lines/{sku}",
    response_model=LineDetail,
    responses={403: {"model": Problem}, 404: {"model": Problem}, 409: {"model": Problem}},
)
async def get_line(
    variant_id: int,
    sku: str,
    identity: Annotated[Identity, Depends(require_seat)],
    shards: Annotated[ShardManager, Depends(get_shards)],
) -> LineDetail:
    context = await _context(shards, identity, variant_id)
    line = context.catalogue.line(sku)
    supplier = context.catalogue.supplier(line.supplier) if line else None
    if line is None or supplier is None:
        raise HTTPException(status_code=404, detail="Line not found.")
    return LineDetail(
        **_summary(context, line).model_dump(),
        description=line.description,
        fabrication=line.fabrication,
        oversize=line.oversize,
        properties=line.properties,
        price_breaks=(
            [] if line.service else list(context.catalogue.price_breaks.get(line.unit, []))
        ),
        supplier=supplier,
    )


@router.post(
    "/variants/{variant_id}/marketplace/compare",
    response_model=CompareOut,
    responses={403: {"model": Problem}, 404: {"model": Problem}, 409: {"model": Problem}},
)
async def compare_lines(
    variant_id: int,
    body: CompareIn,
    identity: Annotated[Identity, Depends(require_seat)],
    shards: Annotated[ShardManager, Depends(get_shards)],
) -> CompareOut:
    """Compare up to five lines side by side with the derived selection
    indices. A POST because the candidate list is the request, not a
    location."""
    context = await _context(shards, identity, variant_id)
    return compare(context.catalogue, context.prices, body.skus)


# ---------------------------------------------------------------------------
# Quotations
# ---------------------------------------------------------------------------


def _read_quote(conn: sqlite3.Connection, quote_id: int, seat_id: int) -> tuple[Any, ...]:
    row = conn.execute(
        "SELECT id, variant_id, seat_id, status, quote_number, catalogue_id,"
        " catalogue_version, created_at, issued_at, valid_until, goods_cents,"
        " discount_cents, cut_fee_cents, freight_cents, tax_cents, total_cents,"
        " total_mass_grams FROM quotes WHERE id = ?",
        (quote_id,),
    ).fetchone()
    # Another seat's quotation is a 404, never a 403: a student must not be able
    # to enumerate what anyone else priced.
    if row is None or int(row[2]) != seat_id:
        raise HTTPException(status_code=404, detail="Quotation not found.")
    return tuple(row)


def _stored_lines(conn: sqlite3.Connection, quote_id: int) -> list[QuoteLineIn]:
    return [
        QuoteLineIn(
            sku=str(row[0]),
            quantity=float(row[1]),
            cut_to_length=bool(row[2]),
            cut_count=int(row[3]),
        )
        for row in conn.execute(
            "SELECT sku, quantity, cut_to_length, cut_count FROM quote_lines"
            " WHERE quote_id = ? ORDER BY position",
            (quote_id,),
        ).fetchall()
    ]


def _write_lines(conn: sqlite3.Connection, quote_id: int, computed: ComputedQuote) -> None:
    conn.execute("DELETE FROM quote_lines WHERE quote_id = ?", (quote_id,))
    conn.executemany(
        "INSERT INTO quote_lines (quote_id, position, sku, supplier_id, name, spec,"
        " unit, quantity, cut_to_length, cut_count, list_price_cents,"
        " unit_price_cents, break_percent, extended_cents, line_cut_fee_cents,"
        " mass_grams) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [
            (
                quote_id,
                line.position,
                line.sku,
                line.supplier_id,
                line.name,
                line.spec,
                line.unit,
                line.quantity,
                int(line.cut_to_length),
                line.cut_count,
                line.list_price_cents,
                line.unit_price_cents,
                line.break_percent,
                line.extended_cents,
                line.cut_fee_cents,
                line.mass_grams,
            )
            for line in computed.lines
        ],
    )
    totals = computed.totals
    conn.execute(
        "UPDATE quotes SET goods_cents = ?, discount_cents = ?, cut_fee_cents = ?,"
        " freight_cents = ?, tax_cents = ?, total_cents = ?, total_mass_grams = ?"
        " WHERE id = ?",
        (
            totals.goods_cents,
            totals.discount_cents,
            totals.cut_fee_cents,
            totals.freight_cents,
            totals.tax_cents,
            totals.total_cents,
            totals.total_mass_grams,
            quote_id,
        ),
    )


def _quote_out(row: tuple[Any, ...], computed: ComputedQuote) -> QuoteOut:
    return QuoteOut(
        id=int(row[0]),
        variant_id=int(row[1]),
        status=str(row[3]),
        quote_number=row[4],
        catalogue_id=str(row[5]),
        catalogue_version=int(row[6]),
        created_at=int(row[7]),
        issued_at=row[8],
        valid_until=row[9],
        lines=computed.lines,
        totals=computed.totals,
        notices=computed.notices,
    )


@router.post(
    "/variants/{variant_id}/quotes",
    status_code=201,
    response_model=QuoteOut,
    responses={403: {"model": Problem}, 404: {"model": Problem}, 409: {"model": Problem}},
)
async def create_quote(
    variant_id: int,
    body: QuoteIn,
    identity: Annotated[Identity, Depends(require_seat)],
    shards: Annotated[ShardManager, Depends(get_shards)],
) -> QuoteOut:
    """Open a basket against this variant. A seat may hold several: quoting two
    routes and comparing them is the exercise working as intended.

    No idempotency key, unlike creating a submission. A retry here costs an
    empty draft the student can discard, whereas the act that makes an artifact
    is issuing, and that one is idempotent by construction.
    """
    context = await _context(shards, identity, variant_id)
    computed = compute_quote(context.catalogue, context.prices, body.lines)
    now = int(time.time())

    def create(conn: sqlite3.Connection) -> int:
        drafts = conn.execute(
            "SELECT COUNT(*) FROM quotes WHERE seat_id = ? AND variant_id = ? AND status = 'draft'",
            (context.seat_id, variant_id),
        ).fetchone()[0]
        if int(drafts) >= MAX_DRAFTS:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"You have {MAX_DRAFTS} open baskets for this problem."
                    " Issue or discard one before starting another."
                ),
            )
        cursor = conn.execute(
            "INSERT INTO quotes (variant_id, seat_id, status, catalogue_id,"
            " catalogue_version, created_at) VALUES (?, ?, 'draft', ?, ?, ?)",
            (variant_id, context.seat_id, context.catalogue.id, context.catalogue.version, now),
        )
        assert cursor.lastrowid is not None
        quote_id = int(cursor.lastrowid)
        _write_lines(conn, quote_id, computed)
        return quote_id

    quote_id = await shards.course(context.course_id).run(create)
    return await get_quote(quote_id, identity, shards)


@router.get(
    "/variants/{variant_id}/quotes",
    response_model=QuoteListOut,
    responses={403: {"model": Problem}, 404: {"model": Problem}, 409: {"model": Problem}},
)
async def list_quotes(
    variant_id: int,
    identity: Annotated[Identity, Depends(require_seat)],
    shards: Annotated[ShardManager, Depends(get_shards)],
) -> QuoteListOut:
    course_id, seat_id = _seat(identity)

    def read(conn: sqlite3.Connection) -> list[QuoteSummary]:
        return [
            QuoteSummary(
                id=int(row[0]),
                status=str(row[1]),
                quote_number=row[2],
                line_count=int(row[3]),
                total_cents=int(row[4] or 0),
                created_at=int(row[5]),
                issued_at=row[6],
            )
            for row in conn.execute(
                "SELECT q.id, q.status, q.quote_number,"
                " (SELECT COUNT(*) FROM quote_lines l WHERE l.quote_id = q.id),"
                " q.total_cents, q.created_at, q.issued_at FROM quotes q"
                " WHERE q.seat_id = ? AND q.variant_id = ? ORDER BY q.id DESC",
                (seat_id, variant_id),
            ).fetchall()
        ]

    return QuoteListOut(items=await shards.course_reads(course_id).run(read))


@router.get(
    "/quotes/{quote_id}",
    response_model=QuoteOut,
    responses={403: {"model": Problem}, 404: {"model": Problem}},
)
async def get_quote(
    quote_id: int,
    identity: Annotated[Identity, Depends(require_seat)],
    shards: Annotated[ShardManager, Depends(get_shards)],
) -> QuoteOut:
    """Read one quotation. A draft is priced live; an issued one reads back from
    its own snapshot, which is what lets it outlive a catalogue revision."""
    course_id, seat_id = _seat(identity)

    def read(
        conn: sqlite3.Connection,
    ) -> tuple[tuple[Any, ...], list[tuple[Any, ...]], list[QuoteLineIn], int]:
        row = _read_quote(conn, quote_id, seat_id)
        stored = conn.execute(
            "SELECT position, sku, supplier_id, name, spec, unit, quantity,"
            " cut_to_length, cut_count, list_price_cents, unit_price_cents,"
            " break_percent, extended_cents, line_cut_fee_cents, mass_grams"
            " FROM quote_lines WHERE quote_id = ? ORDER BY position",
            (quote_id,),
        ).fetchall()
        found = conn.execute("SELECT seed FROM variants WHERE id = ?", (int(row[1]),)).fetchone()
        seed = int(found[0]) if found is not None and found[0] is not None else int(row[1])
        return row, stored, _stored_lines(conn, quote_id), seed

    row, stored, requested, seed = await shards.course_reads(course_id).run(read)

    if str(row[3]) == "issued":
        return _quote_out(row, _frozen(row, stored))

    # The draft's own pinned catalogue, not the course's current one: a course
    # moved to a new catalogue version mid-term must not silently reprice a
    # basket the student is still holding.
    catalogue = load_catalogue(str(row[5]), int(row[6]))
    prices = variant_prices(catalogue, seed)
    return _quote_out(row, compute_quote(catalogue, prices, requested))


def _frozen(row: tuple[Any, ...], stored: list[tuple[Any, ...]]) -> ComputedQuote:
    """Rebuild an issued quotation from its stored lines and totals.

    Nothing priced is recomputed. The catalogue is opened only at the version
    the quotation was struck against, and only for labels no column carries
    (the supplier's name, the lead time, the tax breakdown behind a stored
    total). A published catalogue version never changes, so those reads are as
    frozen as the columns are.
    """
    catalogue = load_catalogue(str(row[5]), int(row[6]))
    lines = [
        ComputedLine(
            position=int(item[0]),
            sku=str(item[1]),
            supplier_id=str(item[2]),
            supplier_name=(
                supplier.name if (supplier := catalogue.supplier(str(item[2]))) else str(item[2])
            ),
            name=str(item[3]),
            spec=str(item[4]),
            unit=str(item[5]),
            unit_label=UNIT_LABELS.get(str(item[5]), str(item[5])),
            requested_quantity=float(item[6]),
            quantity=float(item[6]),
            list_price_cents=int(item[9]),
            unit_price_cents=int(item[10]),
            break_percent=int(item[11]),
            extended_cents=int(item[12]),
            cut_to_length=bool(item[7]),
            cut_count=int(item[8]),
            cut_fee_cents=int(item[13]),
            mass_grams=int(item[14]),
            lead_days=(line.lead_days if (line := catalogue.line(str(item[1]))) else 0),
        )
        for item in stored
    ]
    goods = int(row[10] or 0)
    freight = int(row[13] or 0)
    taxable = goods + freight
    totals = QuoteTotals(
        line_count=len(lines),
        supplier_count=len({line.supplier_id for line in lines}),
        goods_cents=goods,
        discount_cents=int(row[11] or 0),
        cut_fee_cents=int(row[12] or 0),
        freight_cents=freight,
        taxes=[
            TaxLine(code=tax.code, rate=tax.rate, amount_cents=round(taxable * tax.rate))
            for tax in catalogue.taxes
        ],
        tax_cents=int(row[14] or 0),
        total_cents=int(row[15] or 0),
        total_mass_grams=int(row[16] or 0),
        longest_lead_days=max((line.lead_days for line in lines), default=0),
        cost_per_kg_cents=(round(goods / (int(row[16]) / 1000)) if int(row[16] or 0) else None),
    )
    return ComputedQuote(lines=lines, totals=totals, notices=[])


@router.put(
    "/quotes/{quote_id}",
    response_model=QuoteOut,
    responses={403: {"model": Problem}, 404: {"model": Problem}, 409: {"model": Problem}},
)
async def replace_quote_lines(
    quote_id: int,
    body: QuoteIn,
    identity: Annotated[Identity, Depends(require_seat)],
    shards: Annotated[ShardManager, Depends(get_shards)],
) -> QuoteOut:
    """Replace the whole basket. A whole-basket PUT rather than per-line verbs
    because the client holds the basket anyway and a partial update would make
    the totals a negotiation."""
    course_id, seat_id = _seat(identity)

    def prepare(conn: sqlite3.Connection) -> int:
        row = _read_quote(conn, quote_id, seat_id)
        if str(row[3]) != "draft":
            raise HTTPException(
                status_code=409,
                detail="This quotation has been issued and cannot be changed.",
            )
        return int(row[1])

    variant_id = await shards.course_reads(course_id).run(prepare)
    context = await _context(shards, identity, variant_id)
    computed = compute_quote(context.catalogue, context.prices, body.lines)

    def write(conn: sqlite3.Connection) -> None:
        row = _read_quote(conn, quote_id, seat_id)
        if str(row[3]) != "draft":
            raise HTTPException(
                status_code=409,
                detail="This quotation has been issued and cannot be changed.",
            )
        _write_lines(conn, quote_id, computed)

    await shards.course(course_id).run(write)
    return await get_quote(quote_id, identity, shards)


@router.post(
    "/quotes/{quote_id}/issue",
    response_model=QuoteOut,
    responses={403: {"model": Problem}, 404: {"model": Problem}, 409: {"model": Problem}},
)
async def issue_quote(
    quote_id: int,
    identity: Annotated[Identity, Depends(require_seat)],
    shards: Annotated[ShardManager, Depends(get_shards)],
) -> QuoteOut:
    """Freeze the basket into a numbered quotation.

    Issuing is the artifact-making act: it stamps the number and the validity,
    and from here the lines never move. Re-issuing an issued quotation returns
    it unchanged rather than erroring, because a retried request must not cost
    a student their quotation number.
    """
    course_id, seat_id = _seat(identity)
    now = int(time.time())

    def issue(conn: sqlite3.Connection) -> None:
        row = _read_quote(conn, quote_id, seat_id)
        if str(row[3]) == "issued":
            return
        if (
            conn.execute(
                "SELECT COUNT(*) FROM quote_lines WHERE quote_id = ?",
                (quote_id,),
            ).fetchone()[0]
            == 0
        ):
            raise HTTPException(
                status_code=409,
                detail="An empty basket cannot be quoted. Add a line first.",
            )
        catalogue = load_catalogue(str(row[5]), int(row[6]))
        stamped = datetime.fromtimestamp(now, tz=UTC).strftime("%Y%m%d")
        prefix = catalogue.id.split("-")[0].upper()
        conn.execute(
            "UPDATE quotes SET status = 'issued', quote_number = ?, issued_at = ?,"
            " valid_until = ? WHERE id = ?",
            (
                f"{prefix}-{stamped}-{quote_id:04d}",
                now,
                now + catalogue.quote_validity_days * 86400,
                quote_id,
            ),
        )

    await shards.course(course_id).run(issue)
    return await get_quote(quote_id, identity, shards)


@router.delete(
    "/quotes/{quote_id}",
    status_code=204,
    responses={403: {"model": Problem}, 404: {"model": Problem}, 409: {"model": Problem}},
)
async def discard_quote(
    quote_id: int,
    identity: Annotated[Identity, Depends(require_seat)],
    shards: Annotated[ShardManager, Depends(get_shards)],
) -> None:
    """Throw away a draft. An issued quotation is refused: it may already have
    been cited on a submission, and a citation that can vanish is not one."""
    course_id, seat_id = _seat(identity)

    def remove(conn: sqlite3.Connection) -> None:
        row = _read_quote(conn, quote_id, seat_id)
        if str(row[3]) != "draft":
            raise HTTPException(
                status_code=409,
                detail="An issued quotation is a record and cannot be deleted.",
            )
        conn.execute("DELETE FROM quotes WHERE id = ?", (quote_id,))

    await shards.course(course_id).run(remove)


# ---------------------------------------------------------------------------
# Requests for quotation
# ---------------------------------------------------------------------------


@router.post(
    "/variants/{variant_id}/marketplace/rfqs",
    status_code=201,
    response_model=RfqOut,
    responses={403: {"model": Problem}, 404: {"model": Problem}, 409: {"model": Problem}},
)
async def submit_rfq(
    variant_id: int,
    body: RfqIn,
    identity: Annotated[Identity, Depends(require_seat)],
    shards: Annotated[ShardManager, Depends(get_shards)],
) -> RfqOut:
    """Send a request for quotation and get the application-engineering notes
    back. Deterministic rules, never a model call (decision 0062)."""
    context = await _context(shards, identity, variant_id)
    result = advise(context.catalogue, body)
    now = int(time.time())

    def store(conn: sqlite3.Connection) -> tuple[int, str]:
        cursor = conn.execute(
            "INSERT INTO rfqs (variant_id, seat_id, reference, sku, request_json_z,"
            " notes_json_z, created_at) VALUES (?, ?, '', ?, ?, ?, ?)",
            (
                variant_id,
                context.seat_id,
                body.sku,
                # Plain zstd through the codec: a request payload shares no
                # vocabulary with the trained problem-text dictionary, and
                # Python never touches raw zstd either way.
                compress_bytes(body.model_dump_json().encode("utf-8")),
                compress_bytes(result.model_dump_json().encode("utf-8")),
                now,
            ),
        )
        assert cursor.lastrowid is not None
        rfq_id = int(cursor.lastrowid)
        reference = f"RFQ-{rfq_id:05d}"
        conn.execute("UPDATE rfqs SET reference = ? WHERE id = ?", (reference, rfq_id))
        return rfq_id, reference

    rfq_id, reference = await shards.course(context.course_id).run(store)
    return RfqOut(id=rfq_id, reference=reference, created_at=now, request=body, advice=result)


@router.get(
    "/variants/{variant_id}/marketplace/rfqs",
    response_model=list[RfqOut],
    responses={403: {"model": Problem}, 404: {"model": Problem}},
)
async def list_rfqs(
    variant_id: int,
    identity: Annotated[Identity, Depends(require_seat)],
    shards: Annotated[ShardManager, Depends(get_shards)],
) -> list[RfqOut]:
    course_id, seat_id = _seat(identity)

    def read(conn: sqlite3.Connection) -> list[RfqOut]:
        return [
            RfqOut(
                id=int(row[0]),
                reference=str(row[1]),
                created_at=int(row[4]),
                request=RfqIn.model_validate(json.loads(decompress_bytes(bytes(row[2])))),
                advice=RfqAdvice.model_validate(json.loads(decompress_bytes(bytes(row[3])))),
            )
            for row in conn.execute(
                "SELECT id, reference, request_json_z, notes_json_z, created_at"
                " FROM rfqs WHERE seat_id = ? AND variant_id = ? ORDER BY id DESC",
                (seat_id, variant_id),
            ).fetchall()
        ]

    return await shards.course_reads(course_id).run(read)
