# 0044: Deepgram Flux for recognition, Cartesia Sonic for speech

The 800 ms first-audio target in backend 6.5 is a budget to be spent, not a hope,
so the two speech providers were chosen against it and against a constraint the
guides imply but do not spell out: this is a European university platform holding
work students did by hand, so voice data crossing to a jurisdiction we cannot name
is not a trade we may make. Recognition is Deepgram Flux
(`wss://api.eu.deepgram.com/v2/listen`, `flux-general-en`, linear16 at 16 kHz).
Flux is a conversational recognizer with end-of-turn detection built into the
model rather than bolted on as a separate voice-activity layer, which is worth
200 to 600 ms of our budget and maps exactly onto the seam we already have: its
`EndOfTurn` event is the seam's `endpoint` flag, and that event, not the eager
one, is what commits a student turn. Flux's `EagerEndOfTurn` and `TurnResumed`
pair (a medium-confidence ending, then its retraction when the student was only
pausing) would let us begin a reply speculatively for another hundred
milliseconds or so, and we deliberately do not: a draft the recognizer retracts
would have to be unwound from the transcript the rubric later scores, and a
wrong turn boundary corrupts evidence, which is a worse failure than a slower
turn. The adapter therefore surfaces the eager event as an ordinary interim
result and speculative drafting is deferred with the budget closing without it.
Deepgram's EU endpoint is generally available with full in-region processing and
zero retention by default, and streaming is about $0.0077 per minute. Speech is
Cartesia Sonic (`wss://api.cartesia.ai/tts/websocket`), at roughly 190 ms to
first audio on independent measurement and, more importantly, the tightest tail
of the field: its state-space architecture is what makes p99 close to p50, and a
defence is ruined by the occasional slow turn, not by the median one. Its
incremental context protocol is the shape our seam already assumes (send each
tutor text chunk with `continue: true` under one `context_id`, `false` on the
last, and cancel that context to stop mid-reply), it is GDPR compliant with zero
data retention available, and at about $0.011 per thousand characters the speech
half of a defence costs cents. The two residency stories are not symmetric, and
the asymmetry is flagged rather than smoothed over: Deepgram publishes an EU
endpoint we select by hostname, while Cartesia serves one global URL and offers
in-region processing through regional deployments agreed per account, so
`TIRO_CARTESIA_URL` is configurable and the EU guarantee for synthesis is
something procurement must obtain before a real cohort speaks into it. Until it
is obtained, a deployment that cannot make that promise should leave
`TIRO_TTS_PROVIDER` unset and run captioned replies, which the same loop serves. The runner-up on each side is recorded here
because the seam exists to make swapping cheap: ElevenLabs Scribe v2 Realtime is
faster on paper for recognition but gives us no turn detection, and Deepgram
Aura-2 would let a deployment collapse to one vendor, one key, and one data
processing agreement at the price of about 120 ms more first audio. The remaining two
budget items are ours, not a vendor's. The tutor's context (problem, reference
solution, transcription, figures) is large and identical on every turn of a
session, so it is sent with an Anthropic cache breakpoint on the last system
block and on the figures attached to the first student turn; cached reads are a
tenth of the input price and skip the prefix computation. And the conversational
turns run on the fastest suitable Claude rather than the Sonnet-class model the
rest of the platform authors with, while the closing rubric keeps the stronger
pinned model, because a defence turn is a short spoken question and the rubric
is the only call whose judgement is evidence. Both together are what make the
budget close: the harness in `app/defense/test_latency.py`, driving 200 turns
against these providers' measured distributions, reports a 634 ms median and a
782 ms p95 against the 800 ms target, with p99 at 828 ms. That margin is thin
and honest: the tail spills over the target, so the harness is a gate to defend
rather than a result to celebrate, and it is the first thing to re-run when
either provider or the tutor model changes.
