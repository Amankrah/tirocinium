# 0019 — The upload surface's data flow: direct PUTs, proxied auth

Date: 2026-07-23. Phase 3, milestone 3.5. Author: frontend engineer (Claude).

**The browser uploads page bytes straight to object storage via presigned URLs,
while every authenticated call is proxied through the Next server so the seat
token never reaches client JavaScript.** The upload surface is unavoidably
client-side: it captures from the camera, previews and reorders pages, PUTs
each page with its own progress bar, retries a single failed page, and watches
processing progress live. But the seat's session token is an opaque
course-scoped credential held in an httpOnly cookie that client JavaScript can
never read (decision 0011), and the backend's create, complete, and events
endpoints authorize on that token as a bearer credential. Those two facts
decide the shape, and there is no variation on it that keeps the token
httpOnly. The presigned PUTs need no token (the signed URL is the credential),
so they go from the browser directly to object storage, which is the whole
point of presigning and keeps the page bytes off the API. The authenticated
calls are wrapped in Next server actions (`createSubmission`,
`completeSubmission`) that read the cookie and attach the bearer token
server-side; the client component invokes the action and gets back only data
(the presigned targets, the submission state), never the token. Live processing
progress is a server-sent stream, and `EventSource` cannot send an Authorization
header but does send same-origin cookies, so a thin Next route handler proxies
the backend's `/events` stream: the browser opens the same-origin route with its
cookie, the handler reads it and forwards to the backend with the bearer token,
and pipes the stream back; polling `getSubmission` through a server action is the
degradation path when the stream drops. The orchestration itself (create, then
per-page upload with retry, then complete) lives in a framework-agnostic
controller with its side-effects injected, so the sequence is unit-tested
without a browser and the React layer only binds it to state. A submission is
filed against a variant_id, which the Phase 5 variant pool will expose to the
problem view; until then a seed provides it, so this surface is built and tested
against a seeded variant exactly as the backend built the 3.1 upload path.
