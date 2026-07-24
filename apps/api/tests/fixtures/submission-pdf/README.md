# Submission PDF corpus (digital handwriting)

Real student solutions written on a tablet and exported as PDF, the fixtures
for the PDF-upload submission path (decision 0026, input mode B). Students can
photograph paper (mode A, built) or upload a handwriting PDF; a handwriting PDF
has no text layer, so the pipeline renders each page to a raster and reads it
with the vision handwriting model, exactly as a photographed page.

These are captured project assets in Git LFS (`.gitattributes` routes `pdf`
there). The filenames keep the originals' stems with spaces hyphenated
(`question-l.pdf` preserves the original's ambiguous character verbatim rather
than guessing a digit).

Not yet wired: the transcription pipeline does not branch on `application/pdf`
yet, so these are staged for the mode-B implementation. When it lands, they
drive recorded-response tests (render each page, then replay a recorded vision
reading keyed by the rendered image hash, the same way the scan corpus works);
the recorded readings live under `apps/api/tests/recorded/transcription/`.
