"""Seats (backend guide 7.1, milestone 1.5): the pseudonymous student
identity. Codes are credentials, plaintext exists in exactly one response
ever, and everything student-facing hangs off the seat, never a person.
"""

from app.seats.routes import router

__all__ = ["router"]
