# 0009 — Phase 1.4: auth choices the guides leave open

Date: 2026-07-23. Phase 1, milestone 1.4. Author: backend engineer (Claude).

**Professor JWTs live 8 hours, with no refresh flow.** The guide says
"short-lived JWTs" and specifies nothing else. Minutes-scale tokens without a
refresh flow would log professors out mid-authoring; a refresh flow is
machinery the guide did not ask for. One teaching day is the compromise, and
the constant sits in one place (`app/auth/tokens.py`) for revisiting when
institutional SSO arrives. HS256 with a process-wide secret from
`TIRO_JWT_SECRET`; absent that, a per-process random secret with a loud
warning, so development works and production misconfiguration is at least
visible in logs.

**A JWT claiming the seat role is rejected outright.** Seats authenticate
with opaque course-scoped tokens (milestone 1.5) resolved by the same
dependency layer; no legitimate path issues a seat JWT, so
`current_identity` refuses them rather than trusting the claim.

**Passwords are Argon2id, minimum ten characters, and login failures are
uniform.** The guide names Argon2id for seat codes; professor passwords get
the same treatment. Unknown email and wrong password return byte-identical
problem-details bodies, and the unknown-email path verifies against a dummy
hash so both failures cost the same time. Emails are stored lowercased, so
uniqueness is case-insensitive.

**Errors are RFC 7807 from here on.** The first error-bearing endpoints
landed with this milestone, so the problem-details handler
(`app/problems.py`) is now the single rendering path for HTTPException, and
routes annotate their error responses with the Problem model so the contract
documents them. FastAPI's native 422 validation shape is left as is for now;
converting it is cosmetic and can ride with a later milestone if the
frontend wants it.

**Admin accounts have no creation path yet.** The role and its dependency
gate exist (the guide's three roles); the first admin will be created by a
deliberate operational step when something needs one, rather than by an
endpoint nobody has specified.
