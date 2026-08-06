# 0045: The defence socket authenticates by query parameter and degrades out loud

The guides specify the defence conversation but not the shape of the socket that
carries it, so three choices are recorded here. First, authentication: a browser
cannot set headers on a WebSocket handshake, so the seat's opaque token travels
as a query parameter on `/api/v1/conversations/{id}/stream`, which is the same
revocable, course-scoped credential the REST surface takes, and a wrong or
missing one closes with 4401 while another seat's conversation closes with 4404,
indistinguishable from an absent one. The token is short-lived by revocation
rather than by expiry, it never reaches client JS through anything but the
page's own fetch, and the alternative (a one-time ticket exchanged for the
socket) buys nothing while a seat token remains the thing that would leak.
Second, concurrency: guide 6.5 caps live conversations per course, and the cap is
honest, so a full course gets a 409 that says so rather than a silent queue; an
`active` row nobody ever streamed (the student closed the tab between opening the
session and connecting) would otherwise hold a slot for ever, so the open path
first marks rows older than `TIRO_DEFENSE_STALE_SECONDS` abandoned, which no real
defence approaches given the turn cap and the wind-down. Third, degradation is
announced rather than inferred: when a recognizer's stream drops or a
synthesizer refuses mid-reply, the engine emits `speech_down` or `audio_down`
once and continues, because silence from a dead microphone is indistinguishable
from a quiet student, and a client that is told can offer the keyboard instead of
showing a listening state that hears nothing. The reply whose audio died is kept
as captions and as a turn in the transcript, which matters more than the audio:
losing it would mean the next turn was reasoned from a conversation that never
happened, and the rubric would later score a session with a hole in it.
