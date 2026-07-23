"""Professor auth (backend guide 7.1): email accounts with Argon2id
passwords, short-lived JWTs, and the single authorization dependency layer
for the three roles. Seats join in milestone 1.5 with opaque course-scoped
tokens resolved by the same dependency layer.
"""

from app.auth.routes import router

__all__ = ["router"]
