# Recorded transcription responses

Recorded vision-model readings, one JSON file per page, named for the sha256 of
the exact grayscale image bytes the model was shown. The `RecordedTranscriber`
(app/transcription/model.py) replays these so the test suite reads handwriting
without ever calling a live model (testing skill: model calls in tests are
recorded, always). The live-model smoke test runs in its own non-blocking CI
lane.

These are project assets (Git LFS) and grow deliberately as the transcription
corpus does. Each file matches the `PageTranscription` schema: `markdown`,
`confidence`, and `regions` (bounding boxes with per-region confidence).
