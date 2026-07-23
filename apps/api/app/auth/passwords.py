"""Password hashing: Argon2id via argon2-cffi, the same family the guide
mandates for seat codes. Hashing is CPU work; callers run it via
asyncio.to_thread, never inside the writer queue."""

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError

_hasher = PasswordHasher()

# Verified against when no account exists, so unknown-email and wrong-password
# take the same time (backend 7.1's generic-failure discipline, timing form).
DUMMY_HASH = _hasher.hash("tirocinium-dummy-password")


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(stored_hash: str, password: str) -> bool:
    try:
        return _hasher.verify(stored_hash, password)
    except (VerifyMismatchError, InvalidHashError):
        return False
