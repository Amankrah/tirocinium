"""The submission manifest limits (backend guide section 4 Stage 1), in a
dependency-free module because both the upload surface and the transcription
pipeline enforce them: the upload against the declared manifest, and the
mode B expansion (milestone 6.5.1) against the rendered page count, since a
PDF's true page count is unknown until it is rendered."""

MAX_PAGES = 25
MAX_PAGE_BYTES = 15 * 1024 * 1024  # 15 MiB per page
