# 0069 — reading the text block of a model reply

Date: 2026-08-12. Phase 9.6 (a defect against the model-call rules). Author:
backend engineer (Claude).

Every live model seam read its reply as `message.content[0]`, took that block's
`text`, and raised "returned no text block" when it was absent. That held only
while a reply's first block was always the text. It is not: a model that thinks
puts a thinking block first, and thinking is on by default on the current Claude
models, so the ordinary shape of a reply now begins with a block that has no
`text` at all. The failure is silent in the worst way, because the error the
seam raises says the model answered nothing when the model in fact answered
fully, and the import that surfaced it had already spent the decode, the figure
extraction, and the segmentation call before dying on the parse. Reading the
reply now goes through one place, `app/model_text.py`, whose `text_of` walks the
blocks and returns the first one of type `text`, naming the calling seam in the
error when a reply genuinely carries none. All eight live seams (segmentation,
figure detection, handwriting transcription, figure reading, the spec proposer,
variant generation and verification, the working assessor, and the closing
rubric) call it, and the recorded seams the suite drives are untouched, since
they replay a stored value and never see a content block. The wider finding this
came out of is recorded here rather than fixed: every `DEFAULT_*_MODEL` in the
codebase still names a Claude 3.5 id, three of which are retired and now answer
404, so the defaults are dead configuration that only a set environment variable
has been hiding. Choosing the model each seam should name is a calibration
decision per seam (the tutor's turn budget and the rubric's pinned snapshot are
both deliberate) and belongs in its own change, not in this one.
