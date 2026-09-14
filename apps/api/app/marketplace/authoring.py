"""The professor's side of the marketplace (milestone 10.5, decision 0062).

Three things a professor does here: decide whether their course quotes at all
and against which catalogue version, point each case study at a shortlist, and
read what the cohort actually bought.

The shortlist narrows and never restricts. Nothing in this module can remove a
line from a student's reach, because a catalogue that hid the wrong answers
would be doing the selection exercise on the student's behalf, and selection is
the exercise.

Prices shown to a professor are list prices, never a student's. A professor who
could read one seat's struck prices could read them all, and the point of
per-variant pricing is that nobody is holding the same number.
"""

import sqlite3
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.auth.deps import current_identity, get_shards
from app.auth.models import Identity, Role
from app.courses.routes import ensure_course_owner
from app.db.shards import ShardManager
from app.marketplace.catalogue import (
    UNIT_LABELS,
    Brief,
    Supplier,
    available_catalogues,
    load_catalogue,
)
from app.marketplace.pricing import price_band_cents
from app.problems import Problem

router = APIRouter(prefix="/api/v1/courses/{course_id}", tags=["marketplace-authoring"])

MAX_SHORTLIST = 40


class CatalogueChoice(BaseModel):
    id: str
    version: int
    title: str
    line_count: int
    supplier_count: int


class CataloguesOut(BaseModel):
    """What this deployment ships, and what the course is currently pinned to.
    `pinned` is null for a course that does not quote for materials, which is
    the default and stays a perfectly good way to run a course."""

    available: list[CatalogueChoice]
    pinned: CatalogueChoice | None


class PinIn(BaseModel):
    # Null unpins: the marketplace disappears from the course, and the
    # quotations already issued stay exactly where they are. They name their
    # own catalogue version and never needed the course to agree.
    catalogue_id: str | None = Field(default=None, max_length=64)
    catalogue_version: int | None = Field(default=None, ge=1)


class AuthoringLine(BaseModel):
    """A catalogue line as the professor picking a shortlist sees it: list
    price, and the band a student's struck price will fall in."""

    sku: str
    supplier_id: str
    supplier_name: str
    category: str
    name: str
    spec: str
    unit_label: str
    list_price_cents: int
    band_low_cents: int
    band_high_cents: int
    volatility: float
    tags: list[str]
    service: bool
    shortlisted: bool


class AuthoringCatalogueOut(BaseModel):
    id: str
    version: int
    title: str
    suppliers: list[Supplier]
    categories: list[str]
    briefs: list[Brief]
    lines: list[AuthoringLine]


class ShortlistIn(BaseModel):
    skus: list[str] = Field(default_factory=list, max_length=MAX_SHORTLIST)


class ShortlistOut(BaseModel):
    case_study_id: int
    skus: list[str]
    # SKUs the professor asked for that this catalogue version does not have.
    # Returned rather than rejected, so a shortlist carried across a catalogue
    # revision loses the dead lines and keeps the live ones.
    dropped: list[str]


class QuoteReviewEntry(BaseModel):
    """One issued quotation, by seat. A seat number, never a name: this surface
    is for noticing that half the cohort bought stainless, not for finding who
    did."""

    quote_id: int
    quote_number: str
    seat_number: str
    variant_id: int
    case_study_id: int
    line_count: int
    total_cents: int
    total_mass_grams: int
    issued_at: int
    cited: bool


class SkuTally(BaseModel):
    sku: str
    name: str
    category: str
    quote_count: int
    total_quantity: float


class QuoteReviewOut(BaseModel):
    entries: list[QuoteReviewEntry]
    next_cursor: int | None
    # What the cohort chose, most-quoted first. The one view here worth having:
    # a shortlist nobody quotes from is a shortlist that is not landing.
    tallies: list[SkuTally]


async def _owner(shards: ShardManager, course_id: int, identity: Identity) -> None:
    if identity.role is Role.SEAT:
        raise HTTPException(status_code=403, detail="This surface is for professors.")
    await ensure_course_owner(shards, course_id, identity)


async def _seat_numbers(
    shards: ShardManager, course_id: int, seat_ids: list[int]
) -> dict[int, str]:
    """Quotations live in the shard and seats live in the directory, so the join
    happens here rather than in SQL (no cross-shard joins), scoped by course as
    well as by id so a stray seat id cannot resolve to another course's seat.
    The same helper the submission review uses, for the same reason: the seat
    number is the only thing about a student a professor surface ever shows."""
    if not seat_ids:
        return {}
    unique = sorted(set(seat_ids))
    placeholders = ", ".join("?" for _ in unique)

    def read(conn: sqlite3.Connection) -> dict[int, str]:
        rows = conn.execute(
            f"SELECT id, seat_number FROM seats WHERE course_id = ? AND id IN ({placeholders})",
            (course_id, *unique),
        ).fetchall()
        return {int(row[0]): str(row[1]) for row in rows}

    return await shards.directory_reads.run(read)


async def _pinned(shards: ShardManager, course_id: int) -> tuple[str, int]:
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
        raise HTTPException(
            status_code=409,
            detail="Choose a catalogue for this course before editing shortlists.",
        )
    return pin


@router.get(
    "/catalogues",
    response_model=CataloguesOut,
    responses={403: {"model": Problem}, 404: {"model": Problem}},
)
async def list_catalogues(
    course_id: int,
    identity: Annotated[Identity, Depends(current_identity)],
    shards: Annotated[ShardManager, Depends(get_shards)],
) -> CataloguesOut:
    await _owner(shards, course_id, identity)
    available = [
        CatalogueChoice(
            id=catalogue.id,
            version=catalogue.version,
            title=catalogue.title,
            line_count=len(catalogue.lines),
            supplier_count=len(catalogue.suppliers),
        )
        for identifier, version in available_catalogues()
        if (catalogue := load_catalogue(identifier, version))
    ]

    def read(conn: sqlite3.Connection) -> tuple[str | None, int | None]:
        row = conn.execute(
            "SELECT catalogue_id, catalogue_version FROM courses WHERE id = ?",
            (course_id,),
        ).fetchone()
        return (row[0], row[1]) if row is not None else (None, None)

    catalogue_id, version = await shards.directory_reads.run(read)
    pinned = next(
        (choice for choice in available if choice.id == catalogue_id and choice.version == version),
        None,
    )
    return CataloguesOut(available=available, pinned=pinned)


@router.put(
    "/catalogue",
    response_model=CataloguesOut,
    responses={403: {"model": Problem}, 404: {"model": Problem}},
)
async def pin_catalogue(
    course_id: int,
    body: PinIn,
    identity: Annotated[Identity, Depends(current_identity)],
    shards: Annotated[ShardManager, Depends(get_shards)],
) -> CataloguesOut:
    """Pin the course to one catalogue version, or unpin it entirely.

    A pin rather than "latest" because a price list that moves under a term is
    a price list students cannot be asked to defend. Moving the pin forward is
    a deliberate act, and it leaves every issued quotation alone.
    """
    await _owner(shards, course_id, identity)
    if (body.catalogue_id is None) != (body.catalogue_version is None):
        raise HTTPException(
            status_code=422,
            detail="Give both a catalogue and a version, or neither to turn it off.",
        )
    if (
        body.catalogue_id is not None
        and (body.catalogue_id, body.catalogue_version) not in available_catalogues()
    ):
        raise HTTPException(status_code=404, detail="No such catalogue version.")

    def write(conn: sqlite3.Connection) -> None:
        conn.execute(
            "UPDATE courses SET catalogue_id = ?, catalogue_version = ? WHERE id = ?",
            (body.catalogue_id, body.catalogue_version, course_id),
        )

    await shards.directory.run(write)
    return await list_catalogues(course_id, identity, shards)


@router.get(
    "/catalogue",
    response_model=AuthoringCatalogueOut,
    responses={403: {"model": Problem}, 404: {"model": Problem}, 409: {"model": Problem}},
)
async def get_authoring_catalogue(
    course_id: int,
    identity: Annotated[Identity, Depends(current_identity)],
    shards: Annotated[ShardManager, Depends(get_shards)],
    case_study_id: Annotated[int | None, Query()] = None,
) -> AuthoringCatalogueOut:
    """The whole catalogue at list prices, with each line's price band, for
    building a shortlist. Pass a case study to have the current shortlist
    flagged."""
    await _owner(shards, course_id, identity)
    catalogue_id, version = await _pinned(shards, course_id)
    catalogue = load_catalogue(catalogue_id, version)

    shortlist: set[str] = set()
    if case_study_id is not None:
        shortlist = set(await _shortlist_skus(shards, course_id, case_study_id))

    lines = []
    for line in catalogue.lines:
        supplier = catalogue.supplier(line.supplier)
        low, high = price_band_cents(line)
        lines.append(
            AuthoringLine(
                sku=line.sku,
                supplier_id=line.supplier,
                supplier_name=supplier.name if supplier else line.supplier,
                category=line.category,
                name=line.name,
                spec=line.spec,
                unit_label=UNIT_LABELS.get(line.unit, line.unit),
                list_price_cents=line.list_price_cents,
                band_low_cents=low,
                band_high_cents=high,
                volatility=line.volatility,
                tags=line.tags,
                service=line.service,
                shortlisted=line.sku in shortlist,
            )
        )
    return AuthoringCatalogueOut(
        id=catalogue.id,
        version=catalogue.version,
        title=catalogue.title,
        suppliers=catalogue.suppliers,
        categories=sorted({line.category for line in catalogue.lines}),
        briefs=catalogue.briefs,
        lines=lines,
    )


async def _shortlist_skus(shards: ShardManager, course_id: int, case_study_id: int) -> list[str]:
    def read(conn: sqlite3.Connection) -> list[str]:
        if (
            conn.execute("SELECT 1 FROM case_studies WHERE id = ?", (case_study_id,)).fetchone()
            is None
        ):
            raise HTTPException(status_code=404, detail="Case study not found.")
        return [
            str(row[0])
            for row in conn.execute(
                "SELECT sku FROM case_study_shortlist WHERE case_study_id = ? ORDER BY position",
                (case_study_id,),
            ).fetchall()
        ]

    return await shards.course_reads(course_id).run(read)


@router.get(
    "/case-studies/{case_study_id}/shortlist",
    response_model=ShortlistOut,
    responses={403: {"model": Problem}, 404: {"model": Problem}},
)
async def get_shortlist(
    course_id: int,
    case_study_id: int,
    identity: Annotated[Identity, Depends(current_identity)],
    shards: Annotated[ShardManager, Depends(get_shards)],
) -> ShortlistOut:
    await _owner(shards, course_id, identity)
    return ShortlistOut(
        case_study_id=case_study_id,
        skus=await _shortlist_skus(shards, course_id, case_study_id),
        dropped=[],
    )


@router.put(
    "/case-studies/{case_study_id}/shortlist",
    response_model=ShortlistOut,
    responses={403: {"model": Problem}, 404: {"model": Problem}, 409: {"model": Problem}},
)
async def set_shortlist(
    course_id: int,
    case_study_id: int,
    body: ShortlistIn,
    identity: Annotated[Identity, Depends(current_identity)],
    shards: Annotated[ShardManager, Depends(get_shards)],
) -> ShortlistOut:
    """Replace the shortlist. Order is meaning: the first line is the one the
    student sees first, and a shortlist ordered by what the professor wants
    considered is doing work that alphabetical order is not."""
    await _owner(shards, course_id, identity)
    catalogue_id, version = await _pinned(shards, course_id)
    catalogue = load_catalogue(catalogue_id, version)

    kept: list[str] = []
    dropped: list[str] = []
    for raw in body.skus:
        sku = raw.strip().upper()
        if sku in kept:
            continue
        (kept if catalogue.line(sku) is not None else dropped).append(sku)

    def write(conn: sqlite3.Connection) -> None:
        if (
            conn.execute("SELECT 1 FROM case_studies WHERE id = ?", (case_study_id,)).fetchone()
            is None
        ):
            raise HTTPException(status_code=404, detail="Case study not found.")
        conn.execute("DELETE FROM case_study_shortlist WHERE case_study_id = ?", (case_study_id,))
        conn.executemany(
            "INSERT INTO case_study_shortlist (case_study_id, sku, position) VALUES (?, ?, ?)",
            [(case_study_id, sku, index) for index, sku in enumerate(kept)],
        )

    await shards.course(course_id).run(write)
    return ShortlistOut(case_study_id=case_study_id, skus=kept, dropped=dropped)


@router.get(
    "/quotes",
    response_model=QuoteReviewOut,
    responses={403: {"model": Problem}, 404: {"model": Problem}},
)
async def review_quotes(
    course_id: int,
    identity: Annotated[Identity, Depends(current_identity)],
    shards: Annotated[ShardManager, Depends(get_shards)],
    case_study_id: Annotated[int | None, Query()] = None,
    cursor: Annotated[int | None, Query(ge=1)] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> QuoteReviewOut:
    """Issued quotations across the cohort, newest first, with a tally of what
    was bought. Drafts are not here: a basket someone is still filling is not a
    decision they have made."""
    await _owner(shards, course_id, identity)

    catalogue_id, version = await _pinned(shards, course_id)
    catalogue = load_catalogue(catalogue_id, version)

    def read(
        conn: sqlite3.Connection,
    ) -> tuple[list[tuple[Any, ...]], bool, list[SkuTally]]:
        filters = ["q.status = 'issued'"]
        params: list[object] = []
        if case_study_id is not None:
            filters.append("v.case_study_id = ?")
            params.append(case_study_id)
        if cursor is not None:
            filters.append("q.id < ?")
            params.append(cursor)
        where = " AND ".join(filters)
        rows = conn.execute(
            "SELECT q.id, q.quote_number, q.seat_id, q.variant_id, v.case_study_id,"
            " (SELECT COUNT(*) FROM quote_lines l WHERE l.quote_id = q.id),"
            " q.total_cents, q.total_mass_grams, q.issued_at,"
            " EXISTS(SELECT 1 FROM submissions s WHERE s.quote_id = q.id)"
            " FROM quotes q JOIN variants v ON v.id = q.variant_id"
            f" WHERE {where} ORDER BY q.id DESC LIMIT ?",
            (*params, limit + 1),
        ).fetchall()
        page = [tuple(row) for row in rows[:limit]]
        tally_params: list[object] = []
        tally_filter = ""
        if case_study_id is not None:
            tally_filter = " AND v.case_study_id = ?"
            tally_params.append(case_study_id)
        tallies = [
            SkuTally(
                sku=str(row[0]),
                name=str(row[1]),
                category=(line.category if (line := catalogue.line(str(row[0]))) else ""),
                quote_count=int(row[2]),
                total_quantity=float(row[3]),
            )
            for row in conn.execute(
                "SELECT l.sku, l.name, COUNT(DISTINCT l.quote_id), SUM(l.quantity)"
                " FROM quote_lines l JOIN quotes q ON q.id = l.quote_id"
                " JOIN variants v ON v.id = q.variant_id"
                f" WHERE q.status = 'issued'{tally_filter}"
                " GROUP BY l.sku, l.name ORDER BY COUNT(DISTINCT l.quote_id) DESC,"
                " l.sku LIMIT 50",
                tuple(tally_params),
            ).fetchall()
        ]
        return page, len(rows) > limit, tallies

    page, more, tallies = await shards.course_reads(course_id).run(read)
    numbers = await _seat_numbers(shards, course_id, [int(row[2]) for row in page])
    entries = [
        QuoteReviewEntry(
            quote_id=int(row[0]),
            quote_number=str(row[1]),
            seat_number=numbers.get(int(row[2]), ""),
            variant_id=int(row[3]),
            case_study_id=int(row[4]),
            line_count=int(row[5]),
            total_cents=int(row[6] or 0),
            total_mass_grams=int(row[7] or 0),
            issued_at=int(row[8]),
            cited=bool(row[9]),
        )
        for row in page
    ]
    return QuoteReviewOut(
        entries=entries,
        next_cursor=entries[-1].quote_id if more and entries else None,
        tallies=tallies,
    )
