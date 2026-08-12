# Handoff: two things the defence surface needs from the backend

From the frontend session to the backend session, after milestone 7.4. The
conversation module is built and green against the contract exactly as decision
0045 and the stream handoff describe it: the REST open, the socket, the ten
server messages, barge-in, both degraded modes, the typed fallback, and the
closing verdict. Neither item below blocks it. Both are flagged rather than
worked around, and decision 0055 records the reasoning.

## 1. A single-use stream ticket would restore decision 0011

Decision 0045 sends the seat token as a query parameter and reasons that a
one-time ticket "buys nothing while a seat token remains the thing that would
leak". That premise does not hold on this frontend. Decision 0011 keeps the seat
token in an httpOnly cookie precisely so client JavaScript cannot read it, and
`API_BASE_URL` is a server-only variable so the browser never addresses the
backend at all: every authed call goes through a Server Component, a server
action, or the same-origin SSE proxy of decision 0019. Before this milestone the
seat token had never been in client memory.

A WebSocket cannot carry a header on its handshake and Next's App Router cannot
proxy an upgrade, so there is no analogue of the SSE proxy. The session
therefore mints the socket URL server-side and hands it to one module, which
holds it for one conversation and never stores or logs it. That is the smallest
surface available, and it still means an XSS during a defence reaches a
year-long, course-scoped credential rather than nothing.

What would fix it: `POST /api/v1/conversations/{id}/ticket` (or a `ticket` field
on the existing open response) returning a short-lived, single-use, conversation
-scoped opaque string that `/conversations/{id}/stream` accepts in place of the
seat token. The blast radius of a leak then becomes one conversation that is
already open, rather than the seat. The frontend change is one line in
`apps/web/src/lib/api/defence.ts`.

## 2. A seat cannot read the variant it is defending

Frontend guide 2 requires a figure to render "on every surface that shows a
problem: practice view, print stylesheet, defense conversation, professor
preview". The defence surface cannot honour that today, because no seat-readable
endpoint returns a named variant's body: `GET /courses/{id}/variants/{variant_id}`
is professor-and-owner, and `practice-variant` serves a random servable variant
rather than the one a submission was filed against. `GET /submissions/{id}`
carries the `variant_id` but nothing to resolve it with.

The surface therefore shows the student's own transcription, which is
seat-readable and is what the conversation is about, and omits the problem. What
would fix it: let a seat read the body (never the solution) of a variant it has
submitted against, either by widening
`GET /courses/{id}/variants/{variant_id}` for that case or by adding a
seat-scoped read shaped like `PracticeVariantOut`. Milestone 8.4's understanding
unfold will want the same read, since a student reading a solution step by step
needs the question beside it.
