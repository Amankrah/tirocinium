# 0059: Region boxes are drawn on the rendition the model read, not on the scan

Date: 2026-08-11. Milestone 8.1 (web). Author: frontend engineer (Claude).

Frontend guide 4.4 asks submission review for "scan and transcription side by
side with confidence highlighting and region hover-linking between the image and
the text", and the review read (decision 0047) returns both images per page: the
original the student uploaded, and the grayscale rendition the vision model
actually read. A region's `bbox` is normalised 0..1 with a top-left origin, which
needs no page dimensions, but it is normalised against the rendition, and
preprocessing (milestone 3.2) fixes EXIF orientation, downscales, deskews, and
corrects illumination before the model sees anything. The two images are
therefore not the same geometry, and a box drawn on the original would sit
visibly wrong on any page the deskew touched, which is most photographed pages.
So the boxes are drawn on the rendition, and the surface says which image is
which rather than leaving the professor to guess: the rendition is labelled as
what the model read, and the original scan is one keystroke away, unboxed. This
also happens to be the more useful default, because the question a professor is
answering here is whether the reading matches the writing, and the reading was
made from the rendition; a box that lines up on an image the model never saw
would be a prettier lie.

Two smaller choices follow the same reasoning. Low confidence is shown, never
acted on: a region under the threshold is marked on the image and in the text,
and nothing is hidden, reordered, or auto-corrected, because the transcription
is the student's own work and the platform's job is to show the professor where
to look. And presigned URLs expire inside a long review session, so a page whose
image fails to load offers a reload that calls the per-page reissue endpoint
rather than forcing a refetch of the whole submission, which is exactly what that
endpoint exists for.
