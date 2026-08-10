# 0049: the understanding unfold, its numbering, and the personal history

Milestone 8.4 needed a worked solution that reveals itself a step at a time,
and the first question is who decides where the steps are. A model asked to
break a solution into steps would paraphrase, renumber, or tidy it, which is
exactly the "improve or summarize" the import pipeline forbids, so the split is
deterministic Python (`app/unfold/steps.py`) that only ever cuts and never
rewrites: markdown block boundaries and top-level list items, with fenced code
and display-math regions atomic because splitting inside one corrupts the
notation the solution is made of, and a bare heading joining the block it
introduces. The fidelity property the suite pins is that every step's span is
ordered, non-overlapping, exactly equal to its text, and separated from its
neighbours only by whitespace, so no character of the professor's content is
lost, moved, or altered by being split; a `fig://` token therefore stays inside
whichever step holds it, at the position the professor put it. Second, the
solution is earned rather than browsed. It opens once a seat has submitted for
the variant, or once they deliberately give up, and giving up is a real recorded
act (`solution_reveals.gave_up`, migration course/0019) because "reading the
solution is itself an act of engagement" only holds if choosing to read it is a
choice; the platform never records a solution as earned by work that did not
happen. Third, and this is what makes send-to-conversation coherent, the step
numbering is shared: the tutor's context now carries the reference solution
numbered in exactly the numbering the student unfolds, plus a line stating how
many steps they have read, so "step 3" means one thing to both of them and the
never-reveal rule gains a precise line instead of a blanket one (a step already
unfolded is the student's to discuss, everything past it is not). That changed
what ships to the model, so the persona is a new version, `defense-tutor/v2`,
with the change logged. The reveal target is absolute rather than an increment,
so a retry or an out-of-order call can never rewind what a student has already
read. The personal history view is the same seat-only discipline as the mastery
picture: a seat's own submissions newest first with what became of each, and a
professor reads the class through the Phase 8.3 reporting surfaces, never
through a student's own view. One thing 8.4 does not close: frontend guide 4.2
wants a submission to carry its (started, submitted) span from a "start attempt"
moment, and no such timestamp exists yet. It is a practice-loop change to the
create contract rather than a reporting one, so it is flagged here rather than
half-built, and the history view will show it when it lands.
