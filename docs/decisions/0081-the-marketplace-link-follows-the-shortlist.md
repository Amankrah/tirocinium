# 0081: the marketplace link follows the shortlist, not the catalogue pin

Loading BREE 216 put "Price your materials" on all seventy of its problems,
including one that asks whether niobium is FCC or BCC. Nothing was broken. The
catalogue pin is a course setting (directory migration 0005), the problem view
asked the marketplace front door whether the course prices materials at all,
and the honest answer for this course is yes. But the answer to "does *this*
problem involve buying anything" was never asked, because until now there was
nowhere to ask it.

There is. The shortlist (`case_study_shortlist`, course migration 0021) is
per case study and is the professor's own statement about one problem: these
are the lines a student meets first. Decision 0076 introduced it as the
marketplace's equivalent of the source artifact's project briefs. A case study
with a shortlist is one the professor has thought about in marketplace terms; a
case study without one is not. So the link follows the shortlist, and
`offersMarketplace` in `lib/api/marketplace.ts` is the single expression of it:
the front door must succeed, and the shortlist must be non-empty.

The rule this restores is frontend guide 4.1's, quoted in the practice loop's
own code since Phase 10: a dead control is a worse answer than no control. A
student on a crystal-structure question who follows that link reaches a
supplier catalogue with nothing to do in it, which teaches them the control is
noise and costs the link its meaning on the two questions where it is the whole
exercise.

Three things this deliberately does not change.

It does not restrict anything. Decision 0076 is explicit that the shortlist
narrows what a student meets first and never what they can reach, because
deciding a material is wrong is the exercise and a catalogue that hid the wrong
answers would be doing the exercise for them. That still holds exactly: a
student who reaches the marketplace by any route quotes the whole catalogue.
This decides only whether the problem view volunteers the invitation.

It does not change the professor's side. The authoring view still gates on the
course pin (`catalogues.data.pinned !== null`), and it has to: gating the
shortlist editor on a shortlist existing would make the first one impossible to
create.

And it is a behaviour change beyond this course. A pricing course whose case
studies carry no shortlists loses the link everywhere it used to appear. That
is the intended reading of what a shortlist means, and the course pin is now
necessary rather than sufficient, but it is worth knowing before wondering
where the link went.

The course pack carries shortlists as content (`shortlist` on a pack question),
validated against the pinned catalogue at parse time: a SKU the catalogue does
not contain fails the pack rather than loading a link to nothing, which is the
rule the catalogue extractor already applies to a brief naming a missing line.
