"""The project marketplace (decision 0100).

A student doing a design project needs to price materials outside any case
study: there is no variant to seed prices from and no submission to cite a
quotation on. So this surface prices at the catalogue's list prices, the same
figure for every student, as a real supplier's price list is, and stores
nothing. A quotation here is computed on request and handed back for the
student to print; the platform keeps no copy and no basket, so there is no
record to cite, defend, or leak.

It is seat-only, because the seat is the platform's one way a student exists,
but it is not scoped to the seat's case studies: any seat in any course can
use it, whether or not its course prices materials. The catalogue is the one
the seat's course pinned when it has pinned one, so the figures a student meets
here agree with the ones their course teaches from, and otherwise the newest
shipped catalogue.

The arithmetic is the case-study marketplace's own (`compute_quote`, `compare`,
`advise`), called with list prices in place of seeded ones. Nothing about it is
reimplemented here.
"""

import hashlib
import json
import sqlite3
import time
from datetime import UTC, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.auth.deps import get_shards, require_seat
from app.auth.models import Identity
from app.db.shards import ShardManager
from app.marketplace.advice import RfqAdvice, RfqIn, advise
from app.marketplace.catalogue import (
    Brief,
    Catalogue,
    Freight,
    Tax,
    available_catalogues,
    load_catalogue,
)
from app.marketplace.indices import MAX_COMPARE, CompareOut, compare
from app.marketplace.listing import (
    DEFAULT_LIMIT,
    MAX_LIMIT,
    SORT_PATTERN,
    LineDetail,
    LineListOut,
    SupplierSummary,
    line_detail,
    list_prices,
    select_lines,
    supplier_summaries,
)
from app.marketplace.quoting import (
    MAX_LINES,
    ComputedLine,
    QuoteLineIn,
    QuoteTotals,
    compute_quote,
)
from app.problems import Problem

router = APIRouter(prefix="/api/v1/marketplace", tags=["project-marketplace"])

NO_CATALOGUE = "No materials catalogue is installed on this platform yet."

_ERRORS: dict[int | str, dict[str, object]] = {
    401: {"model": Problem},
    403: {"model": Problem},
    503: {"model": Problem},
}


class ProjectMarketplaceOut(BaseModel):
    """The front door: who trades here, the terms every quotation is struck
    on, and the project briefs the catalogue was written for."""

    catalogue_id: str
    catalogue_version: int
    title: str
    course_note: str
    currency: str
    # Always "list": the price basis is stated rather than implied, because a
    # student who also quotes inside a case study meets moving prices there.
    price_basis: Literal["list"]
    quote_validity_days: int
    taxes: list[Tax]
    freight: Freight
    suppliers: list[SupplierSummary]
    categories: list[str]
    briefs: list[Brief]


class ProjectQuotationIn(BaseModel):
    lines: list[QuoteLineIn] = Field(default_factory=list, max_length=MAX_LINES)


class ProjectQuotationOut(BaseModel):
    """A quotation prepared on request and not stored. The reference is a
    digest of the basket, the catalogue and the day, so the same basket
    prepared twice on one day prints the same reference: a student can cite it
    in a report and reproduce it, without the platform keeping anything."""

    reference: str | None
    catalogue_id: str
    catalogue_version: int
    prepared_at: int
    valid_until: int
    lines: list[ComputedLine]
    totals: QuoteTotals
    notices: list[str]


class CompareIn(BaseModel):
    skus: list[str] = Field(min_length=1, max_length=MAX_COMPARE)


class ProjectRfqOut(BaseModel):
    request: RfqIn
    advice: RfqAdvice


async def _catalogue(shards: ShardManager, identity: Identity) -> Catalogue:
    """The seat's course pin when there is one, else the newest shipped
    catalogue. A course that does not price materials still gets a project
    marketplace: a project is not a case study, and its setting is not this."""
    course_id = identity.course_id

    def read(conn: sqlite3.Connection) -> tuple[str, int] | None:
        row = conn.execute(
            "SELECT catalogue_id, catalogue_version FROM courses WHERE id = ?",
            (course_id,),
        ).fetchone()
        if row is None or row[0] is None or row[1] is None:
            return None
        return str(row[0]), int(row[1])

    pin = await shards.directory_reads.run(read) if course_id is not None else None
    if pin is not None:
        return load_catalogue(*pin)
    shipped = available_catalogues()
    if not shipped:
        raise HTTPException(status_code=503, detail=NO_CATALOGUE)
    # Newest version of each catalogue comes first per catalogue; with more
    # than one catalogue shipped, the first by id is the default.
    return load_catalogue(*shipped[0])


def _reference(catalogue: Catalogue, lines: list[ComputedLine], prepared_at: int) -> str:
    day = datetime.fromtimestamp(prepared_at, tz=UTC).strftime("%Y%m%d")
    basket = json.dumps(
        [[line.sku, line.quantity, line.cut_to_length, line.cut_count] for line in lines],
        separators=(",", ":"),
    )
    digest = hashlib.sha256(f"{catalogue.id}:{catalogue.version}:{day}:{basket}".encode())
    prefix = catalogue.id.split("-")[0].upper()
    return f"{prefix}-P-{day}-{digest.hexdigest()[:6].upper()}"


@router.get("", response_model=ProjectMarketplaceOut, responses=_ERRORS)
async def get_project_marketplace(
    identity: Annotated[Identity, Depends(require_seat)],
    shards: Annotated[ShardManager, Depends(get_shards)],
) -> ProjectMarketplaceOut:
    """The supplier directory and the project briefs, at list prices."""
    catalogue = await _catalogue(shards, identity)
    prices = list_prices(catalogue)
    return ProjectMarketplaceOut(
        catalogue_id=catalogue.id,
        catalogue_version=catalogue.version,
        title=catalogue.title,
        course_note=catalogue.course_note,
        currency=catalogue.currency,
        price_basis="list",
        quote_validity_days=catalogue.quote_validity_days,
        taxes=catalogue.taxes,
        freight=catalogue.freight,
        suppliers=supplier_summaries(catalogue, prices),
        categories=sorted({line.category for line in catalogue.lines}),
        briefs=catalogue.briefs,
    )


@router.get("/lines", response_model=LineListOut, responses=_ERRORS)
async def list_project_lines(
    identity: Annotated[Identity, Depends(require_seat)],
    shards: Annotated[ShardManager, Depends(get_shards)],
    supplier: Annotated[str | None, Query()] = None,
    category: Annotated[str | None, Query()] = None,
    tag: Annotated[str | None, Query()] = None,
    q: Annotated[str | None, Query(max_length=100)] = None,
    sort: Annotated[str, Query(pattern=SORT_PATTERN)] = "relevance",
    cursor: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=MAX_LIMIT)] = DEFAULT_LIMIT,
) -> LineListOut:
    """Browse the catalogue at list prices. Relevance is the catalogue's own
    order: there is no case study here, so there is no professor's shortlist."""
    catalogue = await _catalogue(shards, identity)
    return select_lines(
        catalogue,
        list_prices(catalogue),
        supplier=supplier,
        category=category,
        tag=tag,
        q=q,
        sort=sort,
        cursor=cursor,
        limit=limit,
    )


@router.get(
    "/lines/{sku}",
    response_model=LineDetail,
    responses={**_ERRORS, 404: {"model": Problem}},
)
async def get_project_line(
    sku: str,
    identity: Annotated[Identity, Depends(require_seat)],
    shards: Annotated[ShardManager, Depends(get_shards)],
) -> LineDetail:
    catalogue = await _catalogue(shards, identity)
    detail = line_detail(catalogue, list_prices(catalogue), sku)
    if detail is None:
        raise HTTPException(status_code=404, detail="Line not found.")
    return detail


@router.post("/compare", response_model=CompareOut, responses=_ERRORS)
async def compare_project_lines(
    body: CompareIn,
    identity: Annotated[Identity, Depends(require_seat)],
    shards: Annotated[ShardManager, Depends(get_shards)],
) -> CompareOut:
    """Up to five lines side by side with the derived selection indices."""
    catalogue = await _catalogue(shards, identity)
    return compare(catalogue, list_prices(catalogue), body.skus)


@router.post("/quotation", response_model=ProjectQuotationOut, responses=_ERRORS)
async def prepare_project_quotation(
    body: ProjectQuotationIn,
    identity: Annotated[Identity, Depends(require_seat)],
    shards: Annotated[ShardManager, Depends(get_shards)],
) -> ProjectQuotationOut:
    """Price a basket and hand the quotation back. Nothing is written: the
    client sends quantities, never prices, and the server answers with the one
    account of the money, the same arithmetic the case-study quotation uses."""
    catalogue = await _catalogue(shards, identity)
    computed = compute_quote(catalogue, list_prices(catalogue), body.lines)
    now = int(time.time())
    return ProjectQuotationOut(
        reference=_reference(catalogue, computed.lines, now) if computed.lines else None,
        catalogue_id=catalogue.id,
        catalogue_version=catalogue.version,
        prepared_at=now,
        valid_until=now + catalogue.quote_validity_days * 86400,
        lines=computed.lines,
        totals=computed.totals,
        notices=computed.notices,
    )


@router.post("/rfq", response_model=ProjectRfqOut, responses=_ERRORS)
async def project_rfq(
    body: RfqIn,
    identity: Annotated[Identity, Depends(require_seat)],
    shards: Annotated[ShardManager, Depends(get_shards)],
) -> ProjectRfqOut:
    """The application-engineering notes for a request, from the catalogue's
    authored rules (never a model, decision 0076). Not stored."""
    catalogue = await _catalogue(shards, identity)
    return ProjectRfqOut(request=body, advice=advise(catalogue, body))
