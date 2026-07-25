# 0042 — On-platform pen capture (mode C) and the three-mode submission picker

Date: 2026-07-25. Phase 6.5, milestones 6.5.2 and 6.5.3. Author: frontend
engineer (Claude). Records the mode C surface decision 0026 deferred to the
frontend, and how the three input modes are presented together.

**Writing on the platform captures pointer strokes on a canvas and exports them
as ordinary page images into the existing upload flow, so mode C reduces to mode
A on the backend; the three modes are offered as one calm picker, with the file
modes serving as the accessibility fallback for anyone without a pen or touch.**
The submission surface opens on a picker of three choices: photos of paper (mode
A), a handwriting PDF (mode B), and write here (mode C). Modes A and B are the
existing file input, which already accepts images and, since 6.5.1, PDFs;
choosing between them only narrows the file picker's hint, since both feed the
same page manifest and the backend now expands a PDF to rasters. Mode C reveals a
pen pad: a canvas sized to a page ratio that captures stylus, touch, or mouse
input through pointer events (one ink colour on white, `touch-action: none` so
drawing does not scroll the page), with "add page" exporting the canvas to a PNG
`File` and clearing for the next, and "clear" to start a page over. Those PNG
pages join the same page list as photographed pages and upload through the same
orchestration (decision 0019), so nothing downstream changes: pre-checks,
presigned PUT, the completed manifest, preprocessing, the vision read, and
evidence emission all treat a drawn page exactly as a photographed one. The
content-hash cache keys on the rendered bytes as always.

The accessibility floor is honoured through the picker, not by making a canvas
keyboard-drawable (it cannot be). Pen capture is never the only path: the file
modes are always present and are the fallback for a keyboard-only user, a device
with no pointer, or anyone who prefers paper, which satisfies the frontend
guide's requirement of a file-upload fallback where there is no pen or touch.
The pad has no animation, so reduced motion has nothing to still. The picker,
its buttons, and the pad's controls are all keyboard-operable and labelled; the
canvas itself carries an accessible name and a visible instruction. No
personalization and no identity beyond the seat enters the surface: a drawn page
is a seat's handwriting, exactly like a photograph of a seat's handwriting, and
carries no student PII. This is flagged, as decision 0026 asked, as a guide
extension: the guides describe photographing paper, and this adds on-platform
capture in the same spirit, recorded here rather than assumed.
