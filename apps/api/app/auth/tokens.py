"""Short-lived professor JWTs (backend guide 7.1). HS256 with the process
secret; 8 hours of validity (decision 0009: the guide says short-lived and
specifies no refresh flow, so one teaching-day is the balance until SSO).
Seats never get JWTs; their opaque tokens arrive in 1.5."""

import time

import jwt
from pydantic import BaseModel, ValidationError

from app.auth.models import Role

ISSUER = "tirocinium"
DEFAULT_TTL_SECONDS = 8 * 3600


class TokenError(Exception):
    """The token is missing, malformed, expired, or forged; callers map
    this to a generic 401."""


class TokenClaims(BaseModel, frozen=True):
    sub: str
    role: Role
    email: str | None = None
    iat: int
    exp: int
    iss: str


def issue_token(
    *,
    secret: str,
    user_id: int,
    role: Role,
    email: str | None = None,
    ttl_seconds: int = DEFAULT_TTL_SECONDS,
) -> str:
    now = int(time.time())
    claims = TokenClaims(
        sub=str(user_id),
        role=role,
        email=email,
        iat=now,
        exp=now + ttl_seconds,
        iss=ISSUER,
    )
    return jwt.encode(claims.model_dump(exclude_none=True), secret, algorithm="HS256")


def decode_token(token: str, secret: str) -> TokenClaims:
    try:
        payload = jwt.decode(
            token,
            secret,
            algorithms=["HS256"],
            issuer=ISSUER,
            options={"require": ["exp", "iat", "iss", "sub"]},
        )
        return TokenClaims.model_validate(payload)
    except (jwt.PyJWTError, ValidationError) as e:
        raise TokenError(str(e)) from e
