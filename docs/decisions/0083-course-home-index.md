# 0083: the course home walks the problem list, then pages it

The case-study list defaults to 50 and returns a cursor. Course home used to
drop that cursor, so a seat on a course the size of BREE 216 (seventy published
problems) never reached the last twenty, and what they did see was one column
of identical rows: the same concept repeated as a pill, and "Not attempted yet"
on every line. That line was a constant. The summary payload has no attempt
count, so it was false the moment a seat submitted, and useless before that.

The index now follows the cursor to the end, then presents the whole set.
Problems are grouped under the concept they are chiefly about (the first tag,
which the API already orders by weight), a topic opens on its own, and a title
or topic search narrows the set. Twelve at a time, through ordinary links, with
the page, topic, and search in the URL. Guide 4.2b rules out infinite scroll by
name, and a problem set is something a student looks up. A problem is listed
once, under its heaviest concept, and still appears when a student opens
another concept it carries.

Guide 4.1 asks the index for attempts and personal state. This departs from
that sentence on purpose, and the conflict is the payload: a case-study summary
carries a title and its concepts, not an attempt. Printing a state the server
did not send was the bug. Personal state stays where it is true, on the mastery
picture and in Your work, which sit on the same page. A per-row attempt tally
would count activity, which guide 4.2b keeps off the student surface.
