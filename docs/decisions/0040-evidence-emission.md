# 0040: How the automatic evidence sources read a submission

Milestone 6.2 wires the two automatic sources with three recorded choices.
First, `answer_match` is decided by a purpose-built comparer function
(`platform_core.compare.answers_in_text`): each stored final answer's number
sequence must appear as a contiguous in-order run among the numbers the
transcription displays, within the 0038 tolerances, so the arithmetic stays in
the mandated Rust and a student's surrounding working can never false-negative
an answer that is present. When the variant's answers carry no numbers
(essay-style) or the reading displays none at all, no event is emitted, which
is the spec's own posture (bad OCR produces weak or absent evidence, never
wrong evidence); the answer-region confidence is the confidence of the first
transcription region the comparer finds the answers in, falling back to the
submission's overall confidence when no single region contains them. Second,
`working_assessment` runs behind a `WorkingAssessor` vision seam
(`prompts/working-assessment/v1`, recorded in tests): the mapped concepts,
reference solution, and transcription travel as delimited untrusted text, the
essential figures as attached images, and the model returns per-concept
anchored rubric scores with one stated confidence; a concept the model names
but the case does not map is dropped, score is rubric/3, and confidence is the
spec's product of overall transcription confidence and the model's own. Third,
emission runs as a worker step after indexing, writes every event through the
mastery store inside one writer transaction (milestone 6.1's hardening, so the
gate's crashed-write test finds log and cache consistent), and is idempotent:
a submission that already has automatic events emits nothing on retry, so a
requeued job cannot double-count a student's day.
