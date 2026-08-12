# 0061: Giving up is an offered choice, and a step goes to the tutor unsent

Date: 2026-08-11. Milestone 8.4 (web). Author: frontend engineer (Claude).

The unfold read answers a seat who has neither submitted nor given up with a
403, and that is a state rather than a failure, so the surface names both ways
in: upload an attempt, or read the solution without attempting. The second is a
real button, not a hidden path, because decision 0049 already treats giving up
as a legitimate recorded act and hiding it would only mean a student who has
genuinely stopped gets a dead end instead of a solution. The copy that follows
says the record exists and that nothing is held against them, which is true (the
mastery model has no penalty for `gave_up`) and worth saying, since a student
who suspects an invisible cost will not use the feature honestly. Giving up
posts through a plain server-action form, so it needs no client JavaScript and is
a deliberate submit rather than a stray click, and the reveal it sends carries an
absolute `through_step`, so a double submit or a retry can only ever move
forward.

Sending a step into the conversation (guide 4.2) opens the defence with the
student's answer box already written and sends nothing. The tutor's context is
assembled per session and the never-reveal rule is precise about how far a
student has read, so a step arriving as an unsent draft keeps the student the
author of their own turn and lets them edit or discard it, which an
auto-submitted turn would not. The link only appears when this seat has a
processed submission for this variant, because the tutor reads a submission
rather than a variant; the join lives in the seat's own history, the one
seat-readable place that carries both ids, and where there is no such submission
the surface says why rather than offering a link that would fail. The history
view itself pages by a cursor link rather than scrolling forever: guide 4.2b
rules out infinite scroll by name, and a record of one's own work is something to
read to the end of, not a feed.
