# 0088: a control that does nothing says so

The practice loop's "New variant" asks the pool for another version of the
problem. A dry pool answers instantly with the base problem and a null variant
id, which is milestone 5.4's invariant working exactly as intended: a student
is never made to wait on generation.

The surface then swapped that answer in, and two things went wrong at once.
The problem was replaced with text identical to what was already on screen, so
the button appeared to do nothing. And the null id removed the control that
starts the work, because "Start working" renders only when there is a variant
to file an attempt against. Pressing a control that looks inert, and watching
an unrelated one disappear as you do, reads as having broken the page.

So a swap that finds nothing is not a swap. The problem on screen stays, its
controls stay, the attempt already started stays, and a line says why: "This
is the only version of this problem so far. Your professor's others are still
being prepared." That is also true rather than merely reassuring, because a
dry read enqueues a background top-up.

The rule generalises past this button. A control whose action can legitimately
produce no change has to say so, and must never take an unrelated affordance
with it. Frontend guide 4.1 already says a dead control is a worse answer than
no control; this is the same thought one step along, for a control that is
alive but had nothing to do.
