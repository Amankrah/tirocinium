"""Seat codes: 16 characters of Crockford base32 (no I, L, O, U), roughly
80 bits of entropy, grouped for readability. Hashing is Argon2id with a
lighter profile than passwords (decision 0010): the entropy does the work,
the hash only has to not be reversible, and a professor generating 80 seats
should not wait password-grade seconds per code."""

import secrets

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError

ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
CODE_LENGTH = 16
PREFIX_LENGTH = 4

# Crockford's decode equivalences for characters humans confuse.
_AMBIGUOUS = str.maketrans({"I": "1", "L": "1", "O": "0"})

_hasher = PasswordHasher(time_cost=1, memory_cost=8 * 1024, parallelism=1)


def generate_code() -> str:
    """A fresh formatted code, XXXX-XXXX-XXXX-XXXX."""
    raw = "".join(secrets.choice(ALPHABET) for _ in range(CODE_LENGTH))
    return format_code(raw)


def format_code(normalized: str) -> str:
    return "-".join(normalized[i : i + 4] for i in range(0, CODE_LENGTH, 4))


def normalize_code(entered: str) -> str:
    """Uppercase, strip separators, map Crockford's ambiguous characters.

    Raises ValueError when what remains is not a plausible code; callers
    convert that to the same generic failure as a wrong code."""
    cleaned = "".join(ch for ch in entered.upper() if ch.isalnum())
    cleaned = cleaned.translate(_AMBIGUOUS)
    if len(cleaned) != CODE_LENGTH or any(ch not in ALPHABET for ch in cleaned):
        raise ValueError("not a seat code")
    return cleaned


def code_prefix(normalized: str) -> str:
    return normalized[:PREFIX_LENGTH]


def hash_code(normalized: str) -> str:
    return _hasher.hash(normalized)


def verify_code(stored_hash: str, normalized: str) -> bool:
    try:
        return _hasher.verify(stored_hash, normalized)
    except (VerifyMismatchError, InvalidHashError):
        return False
