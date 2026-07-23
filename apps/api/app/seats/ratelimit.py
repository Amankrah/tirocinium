"""Redemption rate limiting (backend 7.1): 10 attempts per IP per hour,
then exponential backoff. In-memory and per-process for now; the Phase 9
hardening pass moves it behind Redis if multi-process deployment demands
it. Failure copy stays generic; the limiter never reveals anything about
codes."""

import time
from collections import deque
from dataclasses import dataclass, field


@dataclass
class RateLimiter:
    max_attempts: int = 10
    window_seconds: int = 3600
    backoff_base_seconds: int = 30
    backoff_cap_seconds: int = 3600
    _attempts: dict[str, deque[float]] = field(default_factory=dict)

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
