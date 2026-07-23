"""Auth boundary models: the three roles and the resolved identity every
authorization check works from."""

from enum import StrEnum

from pydantic import BaseModel


class Role(StrEnum):
    PROFESSOR = "professor"
    ADMIN = "admin"
    SEAT = "seat"


class Identity(BaseModel, frozen=True):
    """Who is calling, as resolved by the dependency layer. Professors and
    admins carry user_id and email; seat identities (milestone 1.5) carry
    course and seat context instead and never an email."""

    role: Role
    user_id: int | None = None
    email: str | None = None


class ProfessorOut(BaseModel):
    id: int
    email: str
    role: Role


class AuthOut(BaseModel):
    token: str
    professor: ProfessorOut
