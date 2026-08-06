# Handoff: the voice defence stream is live

From the backend session to the frontend session, for milestone 7.4. The Phase 7
backend is complete (decisions 0043, 0044, 0045): a defence opens over REST and
runs over a WebSocket, and the socket is the one part of the contract that
OpenAPI cannot express, so it is written out here. The REST half is in the
regenerated `schema.ts`. The full backend gate is green, including the latency
harness, the safety suite, and the fallback tests.

## Opening a session

`POST /api/v1/submissions/{submission_id}/conversation`, seat token only, on the
seat's own submission once it is `processed`:

    {
      "conversation_id": 12,
      "submission_id": 34,
      "status": "active",
      "stream_path": "/api/v1/conversations/12/stream"
    }

A submission still processing is a 409 whose detail says the defence opens once
the transcription is ready. A course already at its cap of live conversations is
also a 409, and it is honest: there is no queue, so the copy should invite the
student back in a few minutes rather than spin. Another seat's submission, or an
absent one, is a 404.

## The stream

Connect to `stream_path` with the seat token as a query parameter, because a
browser cannot set headers on a WebSocket handshake:
`wss://.../api/v1/conversations/12/stream?token={seat_token}`. A missing or
invalid token closes with 4401; a conversation that is not this seat's, or not
active, closes with 4404.

Client to server. Binary frames are raw audio: mono 16 kHz 16-bit PCM, and 80 ms
chunks are what the recognizer wants. Text frames are JSON control messages:
`{"type": "text", "text": "..."}` is a typed turn (the fallback, and a complete
turn on its own), `{"type": "end_turn"}` forces an endpoint for push-to-talk,
and `{"type": "end"}` closes the session and triggers the verdict.

Server to client. Binary frames are reply audio in the same format, to be queued
and played in order. Text frames are JSON, always with a `type`:

- `ready`: the session is up; start capturing.
- `partial` with `text`: interim recognition of what the student is saying.
- `turn` with `text`: the student's turn as committed. This is the text that
  enters the transcript, so it is what to show, not the last partial.
- `reply_text` with `text`: one chunk of the tutor's reply. Concatenate in
  arrival order for captions; they arrive while the audio is still playing.
- `reply_done` with `first_audio_ms`: the reply is complete, and that number is
  the measured first-audio latency for the turn.
- `interrupted`: a reply was cancelled by barge-in. Stop playback and flush the
  audio queue; the partial reply the student already heard stays in the
  transcript, because it was said.
- `wind_down`: the session is nearing its cap and the tutor is closing its
  thread. A quiet signal, not a countdown.
- `speech_down`: recognition died. Offer the keyboard; the session continues.
- `audio_down`: synthesis died. Captions continue; the session continues.
- `closed`: the loop is over.
- `verdict` with `concept_to_revisit` (a concept id, or null): the closing
  rubric landed and its evidence is stored. This is the last message.

## What the surface should honour

Barge-in is server-side, so the client's job is to keep sending audio and to
react to `interrupted`, never to decide locally that the tutor should stop.
Captions are not optional decoration: `speech_down` and `audio_down` are the
two states where they are the whole conversation, and they can arrive at any
point mid-session, so the typed path must be reachable at all times rather than
chosen up front. Microphone permission refusal is the same case as
`speech_down` and should land in the same state rather than a dead end.

No audio is retained anywhere, which is worth saying plainly in the UI copy
once: the transcript and the verdict are what remain. Nothing in the stream
carries a name, a seat code, or anything else about the student, and the
`verdict` deliberately gives only the concept to revisit, not a score; the
mastery surfaces are where a student sees the effect, in the language they
already know from their labels and trails.
