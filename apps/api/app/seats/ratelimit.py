"""Redemption rate limiting (backend 7.1): 10 attempts per IP per hour,
then exponential backoff. In-memory and per-process for now; the Phase 9
hardening pass moves it behind Redis if multi-process deployment demands
it. Failure copy stays generic; the limiter never reveals anything about
codes."""

import os
import time
from collections import deque
from dataclasses import dataclass, field

# The guide's number, and the default everywhere. It is a constant rather than
# a literal in the field default so the test that pins it has something to
# name.
DEFAULT_MAX_ATTEMPTS = 10

MAX_ATTEMPTS_ENV = "TIRO_SEAT_REDEEM_MAX_ATTEMPTS"


@dataclass
class RateLimiter:
    max_attempts: int = DEFAULT_MAX_ATTEMPTS
    window_seconds: int = 3600
    backoff_base_seconds: int = 30
    backoff_cap_seconds: int = 3600
    _attempts: dict[str, deque[float]] = field(default_factory=dict)

    @classmethod
    def from_env(cls) -> "RateLimiter":
        """The limiter the application builds. The ceiling is configuration so
        the browser-tier journeys can run at all: every seeded journey redeems
        a code, both viewports run every journey, and all of it arrives from
        one address, so a real run makes more than ten attempts and the eleventh
        journey fails for a reason that has nothing to do with what it tests
        (decision 0064). The load harness solves the same problem by giving each
        simulated seat its own address, which a browser cannot do.

        The default is unchanged and is what every deployment gets; only a
        deliberately set variable moves it, and the security suite still drives
        the limiter directly at its own ceiling."""
        configured = os.environ.get(MAX_ATTEMPTS_ENV)
        if not configured:
            return cls()
        try:
            ceiling = int(configured)
        except ValueError as bad:
            raise RuntimeError(f"{MAX_ATTEMPTS_ENV} must be an integer") from bad
        if ceiling < DEFAULT_MAX_ATTEMPTS:
            raise RuntimeError(
                f"{MAX_ATTEMPTS_ENV} may only raise the ceiling, never lower it"
                f" below the {DEFAULT_MAX_ATTEMPTS} of backend guide 7.1"
            )
        return cls(max_attempts=ceiling)

    def check(self, ip: str, now: float | None = None) -> int | None:
        """Record an attempt. Returns None when allowed, or the number of
        seconds to wait (Retry-After) when the IP is over the limit; the
        wait doubles with every attempt past the limit, capped."""
        t = time.monotonic() if now is None else now
        attempts = self._attempts.setdefault(ip, deque())
        while attempts and t - attempts[0] > self.window_seconds:
            attempts.popleft()
        attempts.append(t)
        excess = len(attempts) - self.max_attempts
        if excess <= 0:
            return None
        backoff: int = self.backoff_base_seconds * (2 ** (excess - 1))
        return min(backoff, self.backoff_cap_seconds)
