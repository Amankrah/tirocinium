# 0055: The defence conversation surface, and the credential it cannot keep server-side

Date: 2026-08-11. Milestone 7.4. Author: frontend engineer (Claude).

The defence is its own route (`/course/{caseStudyId}/defence/{submissionId}`)
rather than a panel inside the upload flow, because the session is a place a
student goes deliberately, leaving is an explicit act, and the whole audio
module then lives in that route's chunk instead of weighing on a content route.
The page is a Server Component holding the invitation, the honest line that no
audio is kept, and a start action; the REST open runs in a server action on that
click rather than on page load, because opening consumes one of the course's
capped live conversations and a page view is not a decision. Conversation logic
lives in pure modules (`lib/defence/protocol.ts` parses frames,
`lib/defence/session.ts` reduces them into the state the surface renders,
`lib/defence/playback.ts` and `pcm.ts` hold the audio queue and its arithmetic
behind injected seams), which is the upload controller's pattern and for the
same reason: barge-in, degradation, and turn commitment are tested without a
browser. Microphone refusal is routed into the same state as `speech_down`
rather than a dead end, because a student whose microphone is blocked and a
student whose recognizer died need the identical thing, which is the keyboard,
and the typed path is therefore present from the first frame rather than chosen
up front.

One conflict is recorded rather than resolved silently. Decision 0045 sends the
seat token as a WebSocket query parameter and reasons that a one-time ticket
"buys nothing while a seat token remains the thing that would leak". That
premise does not hold on this frontend: decision 0011 keeps the seat token in an
httpOnly cookie specifically so an XSS cannot exfiltrate it, and the API origin
is a server-only variable so the browser never addresses the backend at all.
Honouring 0045 therefore ships both the credential and the origin into client
memory, and a browser cannot set a header on a WebSocket handshake while Next's
App Router cannot proxy an upgrade, so the SSE trick (decision 0019) has no
analogue here. The session opens against the contract as specified, with the URL
minted server-side, handed to one module, held for the length of one
conversation, never stored and never logged. The cost is real and belongs to
0045, not to this record: an XSS during a defence now reaches a year-long
course-scoped credential rather than nothing. A single-use ticket scoped to one
conversation id would restore the property, and that is raised to the backend as
a follow-up rather than assumed here.

A second gap is noted for the same reason. Frontend guide 2 requires figures to
render on every surface that shows a problem, the defence conversation named
among them, but no seat-readable endpoint returns a specific variant's body:
`GET /courses/{id}/variants/{id}` is professor-and-owner, and the practice read
serves a random variant rather than a named one. The surface therefore shows the
student's own transcription, which is seat-readable and is what the conversation
is about, and the missing read is handed to the backend; milestone 8.4's unfold
surface will want the same one.
