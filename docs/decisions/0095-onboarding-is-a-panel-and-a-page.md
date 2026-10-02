# 0095: Onboarding is a panel the student can walk past, and a page they can come back to

Guide 4.2 asks for the handwriting line to be presented "once", which settles
that onboarding exists and leaves open what it is. It is two things, because
one surface cannot do both jobs. A first-run panel sits above the problem index
the first time a seat arrives, carrying the four step titles and nothing else;
a standing page at `/course/how-it-works` carries the explanation and is linked
from course home for good. The first week is exactly when a student is least
able to absorb how the defence fits into the loop, and the week they wonder is
usually the sixth, so an explanation that exists only on arrival is one that
nobody reads at the moment they need it.

The panel is not a dialog. A student reaching their course came to find a
problem, and an explanation that must be dismissed before the page can be used
converts an offer into a toll. It is a labelled region above the index with a
link and a dismiss button, and a test pins that it is not a dialog, because the
easy drift here is toward a modal that "makes sure" everyone reads it.

"Once" means once per student, not once per browser, so the fact is a column on
the seat (directory migration 0006) rather than local storage. The seat is the
student here: there is no account to hang it on, and a flag in local storage
would ask a student again on every device they own, which is not once. Null is
the honest default for every seat issued before the column existed; those seats
meet the panel one more time, which is a fairer price than pretending to know
what they have already read. The write is idempotent and one-way, so a second
tab or a retry keeps the first timestamp.

Dismissal is a server action posting to a seat-only endpoint, and the client
call deliberately swallows its failure. A panel that refused to close because
the network blinked would be a worse product than one that occasionally
reappears, and the cost of the failure is exactly that: it reappears once.

The copy follows the guide on the one point it is specific about. The
handwriting claim is stated plainly and at the strength the evidence supports,
"tends to bed the concept down more firmly", not as settled neuroscience, since
the audience is academic and will rightly distrust a hard claim. The defence is
framed as talking the work through rather than as a second test, which is what
guide 4.2 means by the reward for having done the work.
