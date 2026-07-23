"""The authorization dependency layer (backend guide 7.1): every check in
the API goes through here, nowhere else. current_identity resolves the
bearer credential, professor JWTs and opaque seat tokens alike;
require_professor, require_admin, and require_seat gate roles."""

import hashlib
import sqlite3
import time
from typing import Annotated

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.auth.models import Identity, Role
from app.auth.tokens import TokenError, decode_token
from app.db.shards import ShardManager

SEAT_TOKEN_PREFIX = "seat_"

_bearer = HTTPBearer(auto_error=False)

_UNAUTHORIZED = HTTPException(
    status_code=401,
    detail="Not authenticated.",
    headers={"WWW-Authenticate": "Bearer"},
)


def get_shards(request: Request) -> ShardManager:
    shards: ShardManager = request.app.state.shards
    return shards


def hash_seat_token(token: str) -> str:
    """Seat session tokens are 256-bit random values; sha256 at rest is the
    appropriate treatment (nothing to brute-force), unlike low-entropy
    passwords and human-typed codes which get Argon2id."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


async def _seat_identity(token: str, shards: ShardManager) -> Identity:
    token_hash = hash_seat_token(token)
    row = await shards.directory_reads.run(
        lambda conn: conn.execute(
            "SELECT s.id, s.course_id, s.seat_number, s.status"
            " FROM seat_sessions ss JOIN seats s ON s.id = ss.seat_id"
            " WHERE ss.token_hash = ?",
            (token_hash,),
        ).fetchone()
    )
    if row is None or row[3] != "active":
        # Revoked and unknown are indistinguishable, by rule.
        raise _UNAUTHORIZED
    seat_id, course_id, seat_number = int(row[0]), int(row[1]), str(row[2])
    now = int(time.time())

    def touch(conn: sqlite3.Connection) -> None:
        conn.execute(
            "UPDATE seat_sessions SET last_used_at = ? WHERE token_hash = ?",
            (now, token_hash),
        )
        conn.execute(
            "UPDATE seats SET last_used_at = ? WHERE id = ?", (now, seat_id)
        )

    await shards.directory.run(touch)
    return Identity(
        role=Role.SEAT,
        seat_id=seat_id,
        course_id=course_id,
        seat_number=seat_number,
    )


async def current_identity(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    shards: Annotated[ShardManager, Depends(get_shards)],
) -> Identity:
    if credentials is None:
        raise _UNAUTHORIZED
    token = credentials.credentials
    if token.startswith(SEAT_TOKEN_PREFIX):
        return await _seat_identity(token, shards)
    try:
        claims = decode_token(token, request.app.state.jwt_secret)
    except TokenError:
        raise _UNAUTHORIZED from None
    if claims.role is Role.SEAT:
        # Seats authenticate with opaque tokens, never JWTs; a JWT claiming
        # the seat role has no legitimate issuer.
        raise _UNAUTHORIZED
    return Identity(role=claims.role, user_id=int(claims.sub), email=claims.email)


def require_professor(
    identity: Annotated[Identity, Depends(current_identity)],
) -> Identity:
    """Professor surfaces; admins pass too (a strict superset by design)."""
    if identity.role not in (Role.PROFESSOR, Role.ADMIN):
        raise HTTPException(status_code=403, detail="Professor access required.")
    return identity


def require_admin(
    identity: Annotated[Identity, Depends(current_identity)],
) -> Identity:
    if identity.role is not Role.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required.")
    return identity


def require_seat(
    identity: Annotated[Identity, Depends(current_identity)],
) -> Identity:
    """Student surfaces: seat identities only, professors have their own."""
    if identity.role is not Role.SEAT:
        raise HTTPException(status_code=403, detail="Seat access required.")
    return identity
