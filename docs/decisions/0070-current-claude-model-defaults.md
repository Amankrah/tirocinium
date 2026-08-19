# 0070: Current Claude model defaults, after the 3.5 retirement

Date: 2026-08-13. Cross-cutting (model-call configuration). Author: backend
engineer (Claude). Follows the finding recorded in decision 0069.

**Every live-seam default now names a current Anthropic snapshot:
`claude-sonnet-5` for authoring (vision, segmentation, figure detection, the
spec proposer, generation, verification, working assessment, and the closing
rubric) and `claude-haiku-4-5` for conversational tutor turns.** The previous
defaults were Claude 3.5 ids (`claude-3-5-sonnet-latest`,
`claude-3-5-haiku-latest`, `claude-3-5-sonnet-20241022`). Those models are
retired; a live call against any of them 404s, which is how auto-parameterize
failed on the request path while figure-reading (already overridden to
`claude-opus-5` in the local `.env`) succeeded on the call before it. Decision
0069 named this as dead configuration and left the replacement to a calibration
decision per seam. That is this change. Authoring stays on Sonnet, the
platform's speed-and-intelligence default, not Opus: a local `.env` can still
pin `TIRO_VISION_MODEL_ID` and `TIRO_PROPOSAL_MODEL_ID` (and the rest) to Opus
for a developer who wants it, which is what the override variables exist for.
The tutor stays on the fastest suitable model because the 800 ms first-token
budget did not move. The rubric stays a snapshot rather than a `-latest`
alias because its judgement is evidence (mastery spec section 11); from Claude
4.6 onward Anthropic's dateless ids are themselves pinned snapshots, so
`claude-sonnet-5` meets that rule without a dated suffix. `.env.example` now
lists every model override the code reads, including the four
(`TIRO_PROPOSAL_MODEL_ID`, `TIRO_GENERATION_MODEL_ID`,
`TIRO_VERIFICATION_MODEL_ID`, `TIRO_ASSESSMENT_MODEL_ID`) that 0069's
`.env.example` omitted and that therefore had no documented way to pin them
before this.
