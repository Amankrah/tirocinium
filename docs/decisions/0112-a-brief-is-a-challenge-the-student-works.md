# 0112: A brief is a challenge the student works, and the shortlist is earned

Date: 2026-10-26. Backend and web, marketplace (decisions 0076, 0100, 0101,
0108, 0110). Author: backend engineer (Claude), directed by the product owner.

The product owner looked at a project brief as the marketplace showed it and
saw the exercise done for the student. A brief opened on its title, four factor
words, the three families in contention and eight SKUs, with a button to put
every one of them in the quote, and a card underneath saying these were
candidates and not answers. Narrowing a catalogue of 146 lines to a shortlist
is the most instructive part of a selection project, and the professor's own
version of this assignment, a challenge to find the best materials for a part
on cost, quality and environmental impact, starts from requirements and ends
with a justified shortlist. The page had the two the wrong way round. This
record turns a brief into a challenge, and the guides, silent on a marketplace
altogether, are silent here too.

A challenge is a requirements statement first and only. Catalogue v4 gives
each of the seventeen briefs a context, requirements with targets where one can
be stated, constraints, a deliverable and a suggested weighting, drafted by
the platform's engineer for the course author to review and said to be drafts
in the changelog; the families and the shortlist stay in the asset and are
never sent to a page that has not earned them. A brief from an earlier
catalogue version reads its selection factors as the requirements, so a
pinned course loses nothing. A professor writes their own challenges in the
same shape (`challenges` in the course shard, course migration 0025, through
`/courses/{id}/challenges` and the authoring page, or as `challenges` in a
course pack), and a seat sees only the published ones; the catalogue's briefs
remain the seeded library every course that quotes against that catalogue
gets. The two are course content and platform content respectively, and the
old briefs page had conflated them.

The student does the narrowing with the tools that already exist, plus one.
Search and filters find candidates; the comparison tray holds them; the quote
holds what they would buy. The new tool is the selection matrix
(`app/marketplace/matrix.py`): eleven criteria read from the comparison's own
rows (cost per kg, specific strength and stiffness, toughness, service
temperature, corrosion, UV, embodied energy, carbon, recyclability, lead
time), each scaled across the candidate set so the best scores one and the
worst zero in the better direction, weighted zero to five by the student, and
summed as a percentage of the best possible. Scoring is the server's, for the
reason money is: the stored selection carries the server's figures and a
score the browser worked out would be one the student could not account for.
A candidate with no figure for a weighted criterion scores nothing on it and
the gap is named, because a missing figure is a finding.

The author's shortlist is earned, not browsed. A student commits a selection
(`POST /marketplace/challenges/{key}/selection`): two to five candidates, the
weights, and the basket lines, stored together with the scored matrix and the
quotation priced at list prices as one row in `challenge_selections`, and the
reply carries the reveal: the families, the shortlist lines, and which of the
student's candidates were on it, reported and never graded. A recommit
replaces the work and keeps the first commit's time, because the reveal was
earned once. This is the unfold's rule (decision 0049) applied to a shortlist,
and it is also the one place a project quotation is stored, which deliberately
narrows decision 0100's "nothing is stored": the selection is an artifact the
student will cite, and an artifact has to be kept to be cited.

The selection is evidence. A submission may cite its `selection_id` on the
terms of decisions 0058 and 0076, checked for ownership inside the creating
transaction (a selection is not bound to a variant, since a challenge stands
outside any case study), and the defence context carries it as a fifth
delimited source under `defense-tutor/v4`, which gains one paragraph: a
weighting is an argument, so ask why this criterion over that one, what the
requirements justified, what a moved weight would change, and whether the
priced line is the one the matrix ranked first. The rule never to name the
material the student should have chosen stands. On the web the upload offers
the seat's committed selections for citation and the challenge page is a
Server Component around one island, `challenge-work.tsx`, whose candidates are
the tray and whose quote is the basket, so nothing is chosen twice; the reveal
is rendered on the server from the same read a reload would make.

Two things are stated rather than done. The seventeen requirement statements
are drafts and the course author's review should replace them as a later
catalogue revision. And a professor can write a challenge but cannot yet see
what the cohort committed; a review surface over `challenge_selections`, by
seat number and never ranked, is the natural next piece and is not built here.
