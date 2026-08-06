# 0043: The voice defence runs as three seams, not one speech-to-speech model

Phase 7 could be built two ways in 2026: as a pipeline (streaming speech to text,
then the tutor model, then streaming text to speech) or as one speech-to-speech
realtime model that hears and speaks directly. We build the pipeline, because the
guides decide it: backend 6.5 says the tutor model runs with the same Anthropic
API used everywhere else and that the speech layers are separate services behind
a thin interface so they can be swapped as the market moves, and it puts
turn-taking (endpointing and barge-in) on our server so behaviour is consistent
across devices. A speech-to-speech model would move the tutor off Anthropic,
which costs us the things the product actually depends on: the versioned tutor
prompt with its never-reveal-the-answer rules, the essential figures attached as
images so the defence can be about the diagram the student worked from, the
pinned rubric model whose calibration the mastery spec audits against professor
grades, and a text transcript that is the only thing we keep. For the same reason
we do not hand the loop to a vendor voice-agent orchestrator (Deepgram's Voice
Agent API, or a framework like Vapi or LiveKit Agents): it would put a third
party inside prompt assembly and turn-taking, the two places where our product
law lives, at roughly ten times the per-minute cost of the raw speech services.
So the shape is: `app/defense/speech.py` holds two minimal Protocols (a
streaming recognizer whose events carry the provider's endpointing as a flag, and
a synthesizer that takes text chunks and yields audio chunks and cancels when its
consumer stops), `app/defense/model.py` holds the tutor and the closing rubric
call, and `app/defense/engine.py` is a transport-agnostic turn loop that both the
WebSocket route and the latency harness drive. Audio is never persisted: no
column exists for it in migration course/0018, and the seams shuttle bytes
between the student and the provider keeping nothing.
