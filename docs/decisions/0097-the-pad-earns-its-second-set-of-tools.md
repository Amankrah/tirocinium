# 0097: The pad earns its second set of tools, and the page it exports stays ink on white

Decision 0096 gave the pad a pen, an eraser, weights and an undo stack, which
made it a sheet of paper you can correct. It was still missing the things that
decide whether a student can write mathematics on a tablet at all. Four are
added here: a highlighter, a straight edge, a lasso, and zoom. The ordering
behind that list is what matters, because none of it is decoration.

Zoom is the one that changes whether the pad is usable. A subscript written at
full-page scale on a phone is a smudge, and the alternative a student reaches
for is a photograph of paper, which is a fine fallback and a poor default for
someone who has a stylus in their hand. Magnification costs nothing in the
model: ink is kept in page coordinates and the pointer is read through the
canvas's own box, so the whole feature is how wide the canvas is drawn. Undo,
export, palm rejection and the lasso all carry on without knowing about it.

The straight edge is the cheapest useful tool in a maths course. Fraction bars,
axes, underlines and a long division all want a line that does not wobble, and
drawing one freehand at speed is the difference between working a reader can
follow and working they have to decode. It keeps only the two ends of the drag,
so the line follows the pointer rather than recording the hand on the way.

The lasso selects by majority rather than by contact: a stroke is caught when
most of it is inside the loop, not when any of it is. Catching by a single
sample means a loop drawn around one line of working also takes the descender
of the line above, which the student did not ask for and will discover only
after moving it. Landing inside an existing selection drags it instead of
starting a new loop, because a tool that makes you re-circle what you are
already holding feels like it is arguing with you. The whole drag is one
history entry, not one per pointer sample.

The highlighter is drawn under the writing whatever order it was made in. A
student highlights a line after writing it, so in stroke order the band would
land on top and dim the ink. This page is read back by a transcriber and then
defended, so emphasis bought with legibility is a bad trade; a marker on paper
goes under the ballpoint anyway. For the same reason a page with highlighter
and no writing cannot be added: a page of emphasis with no working on it is a
blank answer, and the student would find that out only after it was marked.

Every edit releases the selection, because the selection holds indices and the
stroke at index four after an undo is not the stroke that was circled. The
drawing rules live in `pen-render.ts` and the lasso geometry in
`pen-select.ts`, both pure and both tested, which is the correction of the gap
0096 left: the rules were previously observable only by opening a browser, and
that is how a stroke-wide pressure average sat in the code being described in
release notes as pressure sensitivity.
