# 0011 — Phase 2.2: the seat session is a server-set httpOnly cookie

Date: 2026-07-23. Phase 2.2. Author: frontend engineer (Claude).

Redemption (backend `POST /api/v1/seats/redeem`) returns an opaque,
course-scoped, revocable seat token. The frontend guide leaves open where that
token lives on the device, and the choice is security-relevant, so it is
recorded here. The token is stored in an httpOnly cookie set by the server, not
in `localStorage` or any client-readable store. Two guide requirements decide
it together: guide 2 wants Server Components to fetch server data directly, and
guide 4.0 wants the seat number quietly present in the shell, which is
server-rendered; both need the token readable on the server for the seat's own
requests, and an httpOnly cookie is exactly that while keeping the credential
out of client JavaScript (so an XSS cannot exfiltrate it). The cookie is
`SameSite=Lax`, `Secure` in production, path `/`, and long-lived (about a year),
because guide 4.0 says the session persists long-term on the device and the
reusable code is the only recovery path, so there is deliberately no logout or
reset surface. One consequence bends guide 2's "client mutations go through
TanStack Query": redemption is a server action instead, because only the server
can set an httpOnly cookie; the reads it unlocks stay ordinary Server Component
fetches. Reversal is cheap (the cookie name and options live in one module), so
if a later surface needs the token client-side, this record changes rather than
the storage silently drifting.
