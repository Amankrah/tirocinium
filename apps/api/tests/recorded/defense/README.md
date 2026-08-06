# Recorded defence sessions

Recorded model responses for the voice defence (backend guide 6.5, Phase 7),
one directory per scripted session holding `replies.json` (the tutor's turns,
in order) and `rubrics.json` (the raw closing verdicts, in order, so a test can
stage a malformed one followed by a well-formed retry). `RecordedTutor.from_dir`
(app/defense/model.py) loads a directory; it keeps the system prompts, turns,
and images it was shown, which is how the suite asserts that the figures
travelled as pixels and that the never-reveal law travelled with every turn.

The gate needs no committed asset: the latency harness, the safety suite, and
the fallback tests build their scripts in memory, because what they assert is
the shape of the loop rather than the wording of one captured conversation.
This is where captured sessions land as the corpus grows, in particular the
sessions the live-model smoke lane replays: the stuck student who escalates to
pleading and then to instructing, the off-task drift, and the injection that
arrives inside a scanned page. Speech providers are never recorded here; audio
is not retained anywhere on the platform, and the speech seams are exercised
with scripted timings (app/defense/conftest.py).

Versioned prompts live at `apps/api/prompts/defense-tutor/` and
`apps/api/prompts/defense-rubric/`.
