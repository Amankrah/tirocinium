# Security review: the seat and session model

Milestone 9.2. This is the OWASP checklist walked against the platform as
built, with the executable evidence named for each item so the review can be
re-run rather than re-argued. Tests live in `apps/api/app/security/`; where an
item is carried by a test elsewhere, that file is named instead.

The two audiences are asymmetric by design, and that shapes the whole review.
Professors hold accounts and passwords; students hold nothing but a seat code,
and the platform stores nothing about them at all. Several classic risks are
therefore absent rather than mitigated, and where that is the case this says so
plainly instead of claiming a control that does not exist.

## A01 Broken access control

Every route under `/api/v1` is swept without credentials and must answer 401;
the four deliberately public routes are enumerated in the test, so opening a
fifth is an edit somebody makes on purpose. The sweep walks the live route
table rather than the committed OpenAPI file, so a route added before the
contract is regenerated is still covered, and it is mutation-checked (a planted
unprotected route fails it). The defence WebSocket is not in that table and has
its own assertion, closing 4401.

Beyond authentication, the tenancy rules are the substance: a seat reads only
its own submissions and its own course, a professor reads only courses they
own, and per-shard ids collide across courses so the course in the path is the
scope. Those are asserted per module (`test_review.py`, `test_reports.py`,
`test_unfold.py`, `test_mastery_api.py`, `test_seats.py`, and the rest), and
the cross-role cases are asserted here: a seat token opens no professor
surface, a professor token opens no seat surface.

## A02 Cryptographic failures

Seat codes are credentials and are stored as Argon2id hashes with a
four-character prefix index for lookup; plaintext is returned in exactly one
response ever, which a log-scanning test in `app/seats` enforces. Professor
passwords are Argon2id. Sessions are 8 h HS256 JWTs for professors and opaque
server-side tokens for seats, the latter precisely so revocation is immediate;
a revoked seat's live token is asserted to die at once rather than at expiry.
Token forgery is covered: a tampered signature, a token signed with another
secret, an expired token, and an `alg: none` token are all refused.

## A03 Injection

SQL is parameterised throughout; the one place a query is assembled from input
is the FTS5 MATCH in `app/retrieval/search.py`, which builds quoted OR-ed word
tokens rather than trusting operator syntax. The injection that actually
matters for this product is prompt injection, and it has its own section below.

## A04 Insecure design

The design decisions that carry the most weight here are the ones that remove
risk rather than guard it: students have no accounts, so there is no account
takeover, no password reset flow, and no session fixation surface; scans live
in object storage reached by short-lived presigned URLs, so the API never
proxies bytes; and generated variants are never served until verified.

## A05 Security misconfiguration

Errors are RFC 7807 problem details rendered by one handler; a 404 body is
asserted to carry no traceback, no SQL, and no filesystem path. Provider keys
come from the environment or a gitignored `.env` that is a no-op under
`TIRO_TESTING`, so the suite cannot inherit real credentials. The JWT secret
falls back to a per-process random value with a warning rather than a default.

## A06 Vulnerable and outdated components

`pip-audit` over the 73 installed distributions reports one advisory:
`pytest 8.4.2`, PYSEC-2026-1845, fixed in 9.0.3. It is a dev-only test runner
and reaches no production code path. Taking the fix was attempted and reverted:
on pytest 9.1.1 the suite segfaults intermittently (passing once, faulting the
next run), which points at native teardown ordering around the PyO3 extension
or pdfium rather than at pytest itself. Shipping an intermittently segfaulting
test suite would be worse than carrying a dev-only advisory, so the upgrade is
deferred with a named next step: reproduce the fault under pytest 9 in
isolation and determine whether it is pdfium's process-wide binding, then
upgrade. This is an accepted risk, recorded rather than closed.

The Rust dependency audit is not yet wired; `cargo audit` belongs in the same
CI lane and is the other half of this item.

## A07 Identification and authentication failures

Login failure copy and status are identical for an unknown account and a wrong
password. Seat redemption is identical for an unknown code and a revoked one,
so redemption cannot be used as an oracle, and a failed attempt never echoes
the code. Redemption is rate limited at 10 attempts per IP per hour with
exponential backoff.

That limiter is honest about its reach. It does not stop an attacker who
rotates addresses, and a test asserts exactly that: two hundred addresses
making nine attempts each are refused nothing. The control that makes guessing
hopeless is entropy, not throttling: sixteen Crockford base32 characters is
eighty bits, so a billion guesses a second needs on the order of tens of
millions of years to exhaust the space, and that number is asserted rather than
assumed. What per-IP limiting does buy is that an attacker cannot lock the
class out, which a global counter would have handed them; that too has a test.

One known limitation: the limiter is in-memory and per-process, so a
multi-process deployment multiplies the effective allowance by the worker
count. Moving it behind Redis is the follow-up, and the entropy argument is
what makes it a hardening item rather than an urgent one.

## A08 Software and data integrity failures

Migrations are numbered and applied per shard with gap and divergence
detection; nobody edits a shard by hand. Generated variants carry full
provenance (seed, both prompt versions, both model ids) and a flagged variant
is never served. The contract seam is byte-checked in CI.

## A09 Logging and monitoring failures

Logs are structured JSON carrying trace and span ids (milestone 8.5). The
no-PII rule is asserted where it would break: seat codes never appear in logs
or error bodies, no metric label carries an identifier, and the per-surface
tests assert that a professor's email and a seat's token never reach a response
body or a log line.

## A10 Server-side request forgery

The platform fetches no user-supplied URL. Object storage keys are
server-chosen under a per-submission prefix, and uploads go direct to storage
via presigned PUTs; the API receives a manifest, never a location to fetch.

## Prompt injection: the red team

Not an OWASP web item, but the risk this product carries that a generic
checklist would miss, and the phases document names it explicitly: hostile text
in a scan must never steer the tutor or the extractor.

The attacker's entry points are the paper a student photographs and the PDF a
professor imports. Both are read faithfully on purpose, so both reach a prompt.
The mechanism that keeps them data is the fence the content sits inside, and
the red team found that mechanism forgeable: the markers were the fixed strings
`<<<content` and `content>>>`, so a student who wrote the closing marker on
their page closed the fence early and everything after it landed outside, in
the document's own voice, where a line like "## New instructions" reads exactly
like one of the platform's own section headers. That was a real vulnerability,
found and fixed in this milestone.

The fix is `app/prompt_safety.py`: the fence carries a random nonce minted when
the document is assembled, always after the attacker wrote their page, so there
is nothing to guess or copy. Sanitising the content would have been a losing
game of escaping. Recorded-response seams key on the canonical form with the
nonce normalised out, so production keeps a fresh fence on every assembly while
replays stay deterministic.

`test_prompt_injection.py` holds the line on every surface that reads untrusted
text: the defence context, the working assessment, auto-parameterization, and
variant generation and verification each get the escape attempt and must keep
it inside the fence. Alongside that, every prompt receiving text the platform
did not write is asserted to state the hostile-text rule in its own words, and
the closing rubric call is asserted to carry the three hard rules, which was a
claim the project had written down but never tested until now.
