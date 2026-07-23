"""Auth routes: signup, login, and the identity probe. Failure copy is
generic by rule (backend 7.1): a login failure never distinguishes unknown
email from wrong password, in body or in timing."""

import asyncio
import sqlite3
import time
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field

from app.auth.deps import current_identity, get_shards
from app.auth.models import AuthOut, Identity, ProfessorOut, Role
from app.auth.passwords import DUMMY_HASH, hash_password, verify_password
from app.auth.tokens import issue_token
from app.db.shards import ShardManager
from app.problems import Problem

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

_BAD_CREDENTIALS = HTTPException(
    status_code=401, detail="Email or password is incorrect."
)


class SignupIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=10, max_length=200)


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(max_length=200)


def _issue(request: Request, user_id: int, email: str) -> AuthOut:
    token = issue_token(
        secret=request.app.state.jwt_secret,
        user_id=user_id,
        role=Role.PROFESSOR,
        email=email,
    )
    return AuthOut(
        token=token,
        professor=ProfessorOut(id=user_id, email=email, role=Role.PROFESSOR),
    )


@router.post(
    "/signup",
    status_code=201,
    response_model=AuthOut,
    responses={409: {"model": Problem}},
)
async def signup(
    body: SignupIn,
    request: Request,
    shards: Annotated[ShardManager, Depends(get_shards)],
) -> AuthOut:
    email = body.email.lower()
    password_hash = await asyncio.to_thread(hash_password, body.password)
    now = int(time.time())

    def insert(conn: sqlite3.Connection) -> int | None:
        try:
            cur = conn.execute(
                "INSERT INTO users (email, password_hash, role, created_at)"
                " VALUES (?, ?, 'professor', ?)",
                (email, password_hash, now),
            )
        except sqlite3.IntegrityError:
            return None
        return cur.lastrowid

    user_id = await shards.directory.run(insert)
    if user_id is None:
        raise HTTPException(
            status_code=409, detail="An account with this email already exists."
        )
    return _issue(request, user_id, email)


@router.post(
    "/login",
    response_model=AuthOut,
    responses={401: {"model": Problem}},
)
async def login(
    body: LoginIn,
    request: Request,
    shards: Annotated[ShardManager, Depends(get_shards)],
) -> AuthOut:
    email = body.email.lower()
    row = await shards.directory_reads.run(
        lambda conn: conn.execute(
            "SELECT id, password_hash FROM users WHERE email = ?", (email,)
        ).fetchone()
    )
    # Verify against a dummy hash when no account exists so both failure
    # paths cost the same; the response is identical either way.
    stored_hash = row[1] if row else DUMMY_HASH
    ok = await asyncio.to_thread(verify_password, stored_hash, body.password)
    if row is None or not ok:
        raise _BAD_CREDENTIALS
    user_id = int(row[0])
    await shards.directory.run(
        lambda conn: conn.execute(
            "UPDATE users SET last_login_at = ? WHERE id = ?",
            (int(time.time()), user_id),
        )
    )
    return _issue(request, user_id, email)


@router.get("/me", response_model=Identity, responses={401: {"model": Problem}})
def me(identity: Annotated[Identity, Depends(current_identity)]) -> Identity:
    return identity
