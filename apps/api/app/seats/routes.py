"""The seat lifecycle (backend 7.1): generation with one-time artifacts,
redemption to opaque course-scoped tokens, revoke, reissue, listing, and
the seat's own identity probe. Plaintext codes appear in exactly one
response ever: the generation artifacts (CSV and PDF behind short-lived
URLs) or a reissue body. Nothing here ever logs a code."""

import asyncio
import contextlib
import io
import secrets
import sqlite3
import time
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from app.auth.deps import (
    SEAT_TOKEN_PREFIX,
    get_shards,
    hash_seat_token,
    require_professor,
    require_seat,
)
from app.auth.models import Identity
from app.courses.routes import ensure_course_owner
from app.db.shards import ShardManager
from app.problems import Problem
from app.seats.artifacts import build_csv, build_pdf
from app.seats.codes import (
    code_prefix,
    format_code,
    generate_code,
    hash_code,
    normalize_code,
    verify_code,
)
from app.storage import (
    ARTIFACTS_BUCKET,
    PRESIGN_TTL_SECONDS,
    ObjectStorage,
    get_object_storage,
)

router = APIRouter(prefix="/api/v1", tags=["seats"])

_BAD_CODE = HTTPException(
    status_code=401,
    detail="That code did not work. Check it against the card from your professor.",
)


class SeatBatchIn(BaseModel):
    count: int = Field(ge=1, le=500)


class SeatBatchOut(BaseModel):
    count: int
    csv_url: str
    pdf_url: str


class SeatOut(BaseModel):
    id: int
    seat_number: str
    status: str
    last_used_at: int | None
    submission_count: int


class SeatListOut(BaseModel):
    seats: list[SeatOut]


class RedeemIn(BaseModel):
    code: str = Field(min_length=1, max_length=64)


class RedeemOut(BaseModel):
    token: str
    seat_number: str
    course_id: int
    course_title: str


class SeatMeOut(BaseModel):
    seat_number: str
    course_id: int
    course_title: str


class ReissueOut(BaseModel):
    seat_number: str
    code: str


class RevokeOut(BaseModel):
    seat_number: str
    status: str


@router.post(
    "/courses/{course_id}/seats",
    status_code=201,
    response_model=SeatBatchOut,
    responses={403: {"model": Problem}, 404: {"model": Problem}},
)
async def generate_seat_batch(
    course_id: int,
    body: SeatBatchIn,
    identity: Annotated[Identity, Depends(require_professor)],
    shards: Annotated[ShardManager, Depends(get_shards)],
    storage: Annotated[ObjectStorage, Depends(get_object_storage)],
) -> SeatBatchOut:
    title = await ensure_course_owner(shards, course_id, identity)
    now = int(time.time())

    start = await shards.directory_reads.run(
        lambda conn: conn.execute(
            "SELECT COUNT(*) FROM seats WHERE course_id = ?", (course_id,)
        ).fetchone()[0]
    )
    numbers = [f"S-{start + i + 1:03d}" for i in range(body.count)]
    codes = [generate_code() for _ in numbers]
    normalized = [normalize_code(c) for c in codes]
    hashes = await asyncio.gather(
        *(asyncio.to_thread(hash_code, n) for n in normalized)
    )

    def insert(conn: sqlite3.Connection) -> None:
        conn.executemany(
            "INSERT INTO seats"
            " (course_id, seat_number, code_hash, code_prefix, status, created_at)"
            " VALUES (?, ?, ?, ?, 'active', ?)",
            [
                (course_id, number, code_hash, code_prefix(norm), now)
                for number, code_hash, norm in zip(
                    numbers, hashes, normalized, strict=True
                )
            ],
        )

    await shards.directory.run(insert)

    rows = list(zip(numbers, codes, strict=True))
    batch = uuid.uuid4().hex
    csv_key = f"seat-codes/{course_id}/{batch}.csv"
    pdf_key = f"seat-codes/{course_id}/{batch}.pdf"

    def upload() -> None:
        with contextlib.suppress(Exception):
            # The bucket usually exists; put_object decides what matters.
            storage.create_bucket(Bucket=ARTIFACTS_BUCKET)
        storage.put_object(
            Bucket=ARTIFACTS_BUCKET, Key=csv_key, Body=io.BytesIO(build_csv(rows))
        )
        storage.put_object(
            Bucket=ARTIFACTS_BUCKET,
            Key=pdf_key,
            Body=io.BytesIO(build_pdf(title, rows)),
        )

    await asyncio.to_thread(upload)
    csv_url, pdf_url = (
        storage.generate_presigned_url(
            "get_object",
            Params={"Bucket": ARTIFACTS_BUCKET, "Key": key},
            ExpiresIn=PRESIGN_TTL_SECONDS,
        )
        for key in (csv_key, pdf_key)
    )
    return SeatBatchOut(count=body.count, csv_url=csv_url, pdf_url=pdf_url)


@router.get(
    "/courses/{course_id}/seats",
    response_model=SeatListOut,
    responses={403: {"model": Problem}, 404: {"model": Problem}},
)
async def list_seats(
    course_id: int,
    identity: Annotated[Identity, Depends(require_professor)],
    shards: Annotated[ShardManager, Depends(get_shards)],
) -> SeatListOut:
    await ensure_course_owner(shards, course_id, identity)
    rows = await shards.directory_reads.run(
        lambda conn: conn.execute(
            "SELECT id, seat_number, status, last_used_at FROM seats"
            " WHERE course_id = ? ORDER BY seat_number",
            (course_id,),
        ).fetchall()
    )
    counts_rows = await shards.course_reads(course_id).run(
        lambda conn: conn.execute(
            "SELECT seat_id, COUNT(*) FROM submissions GROUP BY seat_id"
        ).fetchall()
    )
    counts = {int(seat_id): int(n) for seat_id, n in counts_rows}
    return SeatListOut(
        seats=[
            SeatOut(
                id=int(r[0]),
                seat_number=str(r[1]),
                status=str(r[2]),
                last_used_at=r[3],
                submission_count=counts.get(int(r[0]), 0),
            )
            for r in rows
        ]
    )


@router.post(
    "/seats/redeem",
    response_model=RedeemOut,
    responses={401: {"model": Problem}, 429: {"model": Problem}},
)
async def redeem(
    body: RedeemIn,
    request: Request,
    shards: Annotated[ShardManager, Depends(get_shards)],
) -> RedeemOut:
    ip = request.client.host if request.client else "unknown"
    retry_after = request.app.state.rate_limiter.check(ip)
    if retry_after is not None:
        raise HTTPException(
            status_code=429,
            detail="Too many attempts. Try again later.",
            headers={"Retry-After": str(retry_after)},
        )

    try:
        normalized = normalize_code(body.code)
    except ValueError:
        raise _BAD_CODE from None

    candidates = await shards.directory_reads.run(
        lambda conn: conn.execute(
            "SELECT s.id, s.course_id, s.seat_number, s.status, s.code_hash, c.title"
            " FROM seats s JOIN courses c ON c.id = s.course_id"
            " WHERE s.code_prefix = ?",
            (code_prefix(normalized),),
        ).fetchall()
    )
    match = None
    for row in candidates:
        if await asyncio.to_thread(verify_code, str(row[4]), normalized):
            match = row
            break
    # Wrong, unknown, and revoked are one indistinguishable failure.
    if match is None or str(match[3]) != "active":
        raise _BAD_CODE

    seat_id, course_id, seat_number, title = (
        int(match[0]),
        int(match[1]),
        str(match[2]),
        str(match[5]),
    )
    token = SEAT_TOKEN_PREFIX + secrets.token_urlsafe(32)
    token_hash = hash_seat_token(token)
    now = int(time.time())

    def create_session(conn: sqlite3.Connection) -> None:
        conn.execute(
            "INSERT INTO seat_sessions (seat_id, token_hash, created_at)"
            " VALUES (?, ?, ?)",
            (seat_id, token_hash, now),
        )
        conn.execute("UPDATE seats SET last_used_at = ? WHERE id = ?", (now, seat_id))

    await shards.directory.run(create_session)
    return RedeemOut(
        token=token,
        seat_number=seat_number,
        course_id=course_id,
        course_title=title,
    )


async def _owned_seat(
    shards: ShardManager, seat_id: int, identity: Identity
) -> tuple[int, str]:
    row = await shards.directory_reads.run(
        lambda conn: conn.execute(
            "SELECT course_id, seat_number FROM seats WHERE id = ?", (seat_id,)
        ).fetchone()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Seat not found.")
    course_id, seat_number = int(row[0]), str(row[1])
    await ensure_course_owner(shards, course_id, identity)
    return course_id, seat_number


@router.post(
    "/seats/{seat_id}/revoke",
    response_model=RevokeOut,
    responses={403: {"model": Problem}, 404: {"model": Problem}},
)
async def revoke_seat(
    seat_id: int,
    identity: Annotated[Identity, Depends(require_professor)],
    shards: Annotated[ShardManager, Depends(get_shards)],
) -> RevokeOut:
    _, seat_number = await _owned_seat(shards, seat_id, identity)

    def revoke(conn: sqlite3.Connection) -> None:
        conn.execute("UPDATE seats SET status = 'revoked' WHERE id = ?", (seat_id,))
        conn.execute("DELETE FROM seat_sessions WHERE seat_id = ?", (seat_id,))

    await shards.directory.run(revoke)
    return RevokeOut(seat_number=seat_number, status="revoked")


@router.post(
    "/seats/{seat_id}/reissue",
    response_model=ReissueOut,
    responses={403: {"model": Problem}, 404: {"model": Problem}},
)
async def reissue_seat(
    seat_id: int,
    identity: Annotated[Identity, Depends(require_professor)],
    shards: Annotated[ShardManager, Depends(get_shards)],
) -> ReissueOut:
    _, seat_number = await _owned_seat(shards, seat_id, identity)
    code = generate_code()
    normalized = normalize_code(code)
    new_hash = await asyncio.to_thread(hash_code, normalized)

    def reissue(conn: sqlite3.Connection) -> None:
        conn.execute(
            "UPDATE seats SET code_hash = ?, code_prefix = ?, status = 'active'"
            " WHERE id = ?",
            (new_hash, code_prefix(normalized), seat_id),
        )
        conn.execute("DELETE FROM seat_sessions WHERE seat_id = ?", (seat_id,))

    await shards.directory.run(reissue)
    # The one plaintext exposure for this code, ever.
    return ReissueOut(seat_number=seat_number, code=format_code(normalized))


@router.get(
    "/seats/me",
    response_model=SeatMeOut,
    responses={401: {"model": Problem}, 403: {"model": Problem}},
)
async def seat_me(
    identity: Annotated[Identity, Depends(require_seat)],
    shards: Annotated[ShardManager, Depends(get_shards)],
) -> SeatMeOut:
    assert identity.course_id is not None and identity.seat_number is not None
    title = await shards.directory_reads.run(
        lambda conn: conn.execute(
            "SELECT title FROM courses WHERE id = ?", (identity.course_id,)
        ).fetchone()[0]
    )
    return SeatMeOut(
        seat_number=identity.seat_number,
        course_id=identity.course_id,
        course_title=str(title),
    )
