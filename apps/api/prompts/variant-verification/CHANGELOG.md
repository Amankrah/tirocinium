# variant-verification

## v1

Initial version (milestone 5.3). The independent re-solve: the variant's
question only (never the generation pass's solution or reasoning), with the
essential figures attached as images so a variant whose text has drifted out
of agreement with a diagram produces disagreeing answers and is flagged. An
unsolvable problem returns empty final answers (unverifiable, so flagged),
never a guessed agreement. Hostile text inside the problem is data.

## v2

Pins the format of `final_answers` to one value per sub-question, stated once.

The comparer (`platform_core.compare`) reads the numbers out of each answer
string and compares them element by element, so two answers agree only when
they carry the same numbers in the same order. v1 asked for "numeric results to
at least four significant figures, with units" and left the arrangement open,
which is enough rope for the generation pass to write
"R = 1.431 x 10^-8 cm = 0.1431 nm" and the verification pass to write
"0.1431 nm". Those are the same physics and a structural mismatch, so the
variant is flagged and withheld from students for a formatting difference.

Loading BREE 216 hit this on every variant it generated: the physics was right
every time (aluminium 0.1431 nm, tungsten 0.1369 nm, copper 0.1278 nm) and the
flag rate was still 100%. Materials questions are the worst case for it,
because almost every answer can be stated in two units.

v2 says: one entry per sub-question, one number, one unit, no second unit, no
symbol prefix, no commentary, and states why. No other change.

## v3

Closes the rest of the format gap: answer in the form the question names.

v2 stopped the two passes stating one result twice, which took the flag rate
from every variant to roughly a third of them. What remained was the half of
the problem v2 could not reach. The verification pass never sees the generated
solution, by design, so it cannot match a format it was not told about; the
only thing both passes read is the question. If the question does not name the
unit, one pass answers in cm and the other in nm. If it does not order its
parts, one answers iron then nickel and the other nickel then iron. If it does
not say whether a change is wanted as a fraction or a percentage, the two
differ by a factor of a hundred. Every one of those is a correct variant
withheld for a disagreement about presentation.

Measured on BREE 216: 64% of variants verified under v2, and all ten failures
were representation mismatches rather than arithmetic. v3 moves the decision
into the question, where both passes can see it.

## v4

Keeps prose out of `final_answers`.

v3 settled how a number is written. What it left was what counts as an answer
at all. A question that asks for a value and then for a reason was producing
two entries, the second a paragraph, and two independent solvers never write
the same paragraph. The comparer reads these entries number by number, so such
a variant is flagged however right both passes are.

Measured on BREE 216: eighteen questions could not fill their pool, and five
of them reached the thirty-attempt ceiling with nothing verified at all. In
every case the physics was correct on both sides. The FeO question generated
"rock salt (NaCl) structure" against a re-solve saying "the rock salt (sodium
chloride, NaCl) structure: an FCC array of O2- anions with Fe2+ filling all
octahedral interstices"; the chlorinated-polyethylene question put a whole
comparison with PVC in an answer slot.

This also removes dead weight downstream. `final_answers` feeds answer_match,
which looks for each answer's numbers in a student's transcription, so a
sentence there was never going to match anything anyway.

v4: a number with its unit, or a short standard name in its shortest form, and
no entry at all for a part that asks why.
