# 0052: the security pass, and the fence that could be forged

Milestone 9.2's four parts land as `apps/api/app/security/` plus the walked
checklist in `docs/security-review.md`, which names the executable evidence for
each OWASP item so the review can be re-run rather than re-argued. Three things
are worth recording as decisions rather than results. First, the finding. The
red team on prompt injection was supposed to confirm that hostile text in a
scan cannot steer the tutor or the extractor; instead it showed the opposite.
Untrusted content was fenced with the fixed strings `<<<content` and
`content>>>`, so a student who wrote the closing marker on their paper closed
the fence early, and because the transcription prompt reproduces a page
faithfully (as it must), everything after it landed outside the fence in the
document's own voice, where a line like "## New instructions" is
indistinguishable from one of the platform's own headers. The fix is not to
sanitise the content, which is a losing game of escaping, but to make the
marker unforgeable: `app/prompt_safety.py` mints a random nonce per assembled
document, always after the attacker wrote their page. That created a direct
conflict with the recorded-response seams, which key on the document hash and
need determinism, resolved by keying on a canonical form with the nonce
normalised out, since a nonce is packaging and not content. Second, the
rate-limit verification is written to state what the control does not do:
per-IP throttling cannot stop an attacker who rotates addresses, and a test
asserts that two hundred addresses making nine attempts each are refused
nothing. The control that actually makes guessing hopeless is eighty bits of
entropy, asserted as a number; the limiter's real contribution is that, being
per-IP rather than global, it denies an attacker the ability to lock the class
out, which also has a test. Third, the dependency audit found one advisory,
PYSEC-2026-1845 against pytest 8.4.2, fixed in 9.0.3. Taking the fix was
attempted and reverted: on pytest 9.1.1 the suite segfaults intermittently,
which points at native teardown ordering around the PyO3 extension or pdfium
rather than at pytest. An intermittently segfaulting suite is worse than a
dev-only advisory that reaches no production path, so the upgrade is deferred
as an accepted risk with a named next step rather than quietly skipped, and
`cargo audit` for the Rust half is still unwired. Along the way the access
sweep was mutation-checked with a planted unprotected route, and the closing
rubric call was found to carry the three hard rules in fact but not in test;
`RecordedTutor` now records that call's system prompt so the claim is asserted.
