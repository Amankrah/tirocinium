# Recorded working-assessment responses

Recorded model responses for the working-assessment evidence pass (mastery
spec section 3, milestone 6.2), one JSON file per document, named for the
sha256 of the exact document text the model was shown (the mapped concepts,
reference solution, and student transcription as delimited content, assembled
by `assessment_document`; the essential figures travel as attached images
beside it). The `RecordedWorkingAssessor` (app/mastery/model.py) replays
these and keeps the images it was shown so tests can assert the figures
travelled as pixels.

Each file is a JSON object matching `WorkingAssessment`: per-concept anchored
rubric scores (0 wrong approach to 3 fully sound) and the model's one stated
confidence, which downstream multiplies by the transcription confidence. The
emission tests build their assessor in memory, so the gate needs no committed
asset; this is where a captured set lands as real corpora grow.

Versioned prompts live at `apps/api/prompts/working-assessment/`.
