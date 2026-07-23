# 0010 — Phase 1.5: seat mechanics the guides leave open

Date: 2026-07-23. Phase 1, milestone 1.5. Author: backend engineer (Claude).

**Seat codes get a lighter Argon2id profile than passwords.** A password
hash's work factor compensates for human-chosen secrets; a seat code is 80
bits of machine-generated entropy, unguessable regardless of hash cost, and
a professor generating 80 seats should not wait password-grade seconds per
code. Codes hash with time_cost 1, 8 MiB memory, parallelism 1 (still
Argon2id, still salted, still one-way); professor passwords keep the library
defaults. Seat session tokens are 256-bit random values and are stored as
plain sha256, for the same entropy reason.

**Session revocation rides on seat status, and reissue kills sessions.**
Auth resolves every seat token against its seat row and requires status
active, so revocation is instant without hunting sessions down (revoke also
deletes them for hygiene). Reissue replaces the hash and prefix on the same
seat row (history hangs off the seat id), deletes all sessions (the premise
of reissue is a leaked code), reactivates a revoked seat, and returns the
new plaintext exactly once in its response body. Generation returns no
plaintext at all: codes exist only in the CSV and PDF artifacts behind
15-minute presigned URLs, and the log-scanning test enforces
exactly-once across every response and zero appearances in logs.

**fpdf2 joins the dependency set.** The one-time download includes a
print-ready PDF of code cards (frontend 4.0b); hand-rolling PDF syntax to
avoid a dependency would be write-only code. fpdf2 is pure Python, small,
and pinned in uv.lock like everything else.

**The rate limiter is in-memory and per-process.** 10 attempts per IP per
hour, then exponential backoff doubling from 30 s and capped at an hour,
surfaced as 429 with Retry-After. Multi-process deployment moves this
behind Redis in the Phase 9 hardening pass; the interface (one check call)
is shaped for that swap.

**The course-shard core schema landed early, and courses gained an owner.**
The Phase 1 gate's latency check needs the realistic 50-case, 500-submission
fixture shard, so backend 3.4's schema is course migration 0003 now, with
Phase 2 and 3 building the CRUD and pipelines on it. Seat management is
owner-only, which needs course ownership before Phase 2's full course model:
courses.owner_id plus a minimal create endpoint, both extended in 2.1.
