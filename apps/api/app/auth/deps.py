"""The authorization dependency layer (backend guide 7.1): every check in
the API goes through here, nowhere else. current_identity resolves the
bearer credential; require_professor and require_admin gate roles. Seat
identities (opaque course-scoped tokens) join in milestone 1.5 by extending
current_identity, so route guards never change shape."""

from typing import Annotated

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.auth.models import Identity, Role
from app.auth.tokens import TokenError, decode_token
from app.db.shards import ShardManager

_bearer = HTTPBearer(auto_error=False)

_UNAUTHORIZED = HTTPException(
    status_code=401,
    detail="Not authenticated.",
    headers={"WWW-Authenticate": "Bearer"},
)


def get_shards(request: Request) -> ShardManager:
    shards: ShardManager = request.app.state.shards
    return shards


def current_identity(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> Identity:
    if credentials is None:
        raise _UNAUTHORIZED
    try:
        claims = decode_token(credentials.credentials, request.app.state.jwt_secret)
    except TokenError:
        raise _UNAUTHORIZED from None
    if claims.role is Role.SEAT:
        # Seats authenticate with opaque tokens (1.5), never JWTs; a JWT
        # claiming the seat role has no legitimate issuer.
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
