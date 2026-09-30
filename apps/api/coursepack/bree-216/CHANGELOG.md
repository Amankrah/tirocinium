# bree-216 course pack changelog

A course pack is a project asset, reviewed like code and versioned like a
prompt (decision 0077). A revision is a new `vN.json`; an existing file is never
edited in place, because a loaded question is already carrying a student's
submissions and mastery evidence and the identity map is what makes a reload
land on that row rather than beside it.

## v1

The practice questions of BREE 216, taken from the course's own teaching
materials: the tutorial sets under `05 - Tutorials` and the "Sample questions"
decks that sit beside each lecture. The Callister instructor solution manuals
in the same folder are deliberately not here. They are the publisher's problem
bank rather than the course's practice set, and putting several hundred of them
into a student-facing tool is a decision for the professor to take explicitly,
not one to arrive at by sweeping a directory.

Ten concepts, one per lecture topic, are declared from the start even though
the questions arrive topic by topic. The mastery picture states an unseen
concept as unseen (spec section 2), so a syllabus that is visible before it is
fully practised reads honestly, and the concept positions do not churn as each
topic lands.

Figures are the professor's own pixels, pulled out of the source PDF by
`platform_core.pdf.extract_figures` (the extractor the import pipeline uses)
and committed here as bytes with their sha256. They are committed rather than
resolved at load time because the materials folder is two gigabytes and is not
in the repository, so a pack that reached into it would load on one machine and
fail on every other. Each figure records the document, page and normalised bbox
it came from, so the copy stays traceable to the original.

Answer tables are transcribed as markdown rather than carried as images. The
distinction is deliberate and is not a softening of the figures-are-pixels
constraint: a unit cell diagram is a figure and is never redrawn, while the
professor's "head coordinates, tail coordinates, coordinate differences" table
is text that happens to have been pasted as a picture. As text it can be split
into steps by the unfold and read by the tutor; as a picture it can be neither.

### L1, structure of crystalline solids (7 questions)

Five numerical questions from `T1 - Crystalline structures` (the palladium and
tantalum radii, the niobium and rhodium structure determinations, and the iron
BCC-to-FCC volume change) and the two indexing questions from the
`Q and A - crystallographic direction and planes` deck, which carry the deck's
two unit cell diagrams.

Two corrections to the source are flagged rather than carried silently.

The tutorial writes the element as "Nobium"; it is transcribed as "niobium",
the spelling of the element.

The iron transformation question states "the radius for (BCC) = 0.2910 nm and
for (FCC) = 0.3647 nm", but its own worked answer uses those numbers as the
lattice parameter $a$ and could not reach the stated 1.57% contraction if they
were radii. The question is transcribed as "the lattice parameter $a$", which
is what makes the professor's answer correct. This one matters beyond spelling:
left as written, every student who took "radius" at its word would be marked
wrong by a tutor holding the professor's own solution as ground truth.

### L2, imperfections in solids (8 questions)

Seven from the tutorial `Sample questions in imperfection in solids` (the
aluminium-lithium skin composition, the Ti-6Al-4V density, the vacancy
concentrations in iron and in lead, the two atom-percent conversions, and the
crystal-structure determination that the DOCX carries and the PDF does not),
plus the Hume-Rothery table from the lecture deck `Sample questions -
Imperfections`, which appears in no tutorial file.

No figures. Every question in this topic is numerical or tabular, and the
tables are transcribed as markdown for the reason L1's answer tables were: as
text they can be stepped by the unfold and read by the tutor.

Every stated answer was recomputed from the question's own data before it was
committed, and all sixteen figures agree with the professor's: 2.38 wt% Li,
4.38 g/cm3, 1.18e24 vacancies per cubic metre, 2.41e-5 and 5.03e-10 with a
ratio of 4.79e4, 70.6 and 29.4 at%, 72.5 and 27.5 at%, 1.00 atom per unit cell
for the simple-cubic determination, and all twelve radius deltas in the
Hume-Rothery comparison.

Two of the professor's rendered answers reached the extracted text as images
and were read off the source PDF rather than reconstructed, which is how parts
(b) and (c) of the lead vacancy question kept the author's own 5.03e-10 and
4.79e4 rather than a recomputation that happened to agree.

The crystal-structure question is the pack's first with two concepts: it is
mapped to imperfections at 1.0 and to the structure of crystalline solids at
0.6, because solving it needs the alloy-averaging of this topic and the unit
cell counting of the previous one. Weights are independent and are never
normalised across a question (mastery spec section 2).

This topic is where decision 0078 came from: the Hume-Rothery table was the
first table the product had ever been asked to render, and it rendered as a run
of pipe characters until `remark-gfm` landed on both reading renderers.

### L3, diffusion (8 questions)

Six from the tutorial `Sample question on Diffusion` (hydrogen through a
palladium sheet, the nitrogen depth in steel, the diffusion coefficient from a
carburizing-decarburizing couple, the decarburization position, the temperature
giving a stated coefficient, and the activation energy from two temperatures),
the silver-gold diffusion couple from the separate `Solution to tutorial
Question 7` DOCX, and the carburizing-time question from the lecture prep set,
which appears in no tutorial file.

No figures. The error-function interpolations and the two-temperature data are
transcribed as markdown tables, which render as tables from decision 0078
onward.

Every stated answer was recomputed from the question's own data before it was
committed and all of them agree with the professor's, including the two the
tutorial states without working (1152 K for the copper-in-nickel temperature,
and 92 h for the diffusion couple).

Two answers the source asks for but never gives are supplied here, and both are
flagged rather than quiet. Question 3's worked solution stops at the
substitution and never evaluates it; the value is
3.96e-11 m2/s. Question 6 asks for "the values of D0 and the
activation energy Qd" but its answer line states only D0 and the part (b)
coefficient; the activation energy is 2.53e5 J/mol. That
second one is not a guess: deriving Qd from the two tabulated points and
feeding it back reproduces the professor's own 2.2e-5 m2/s for D0 and
5.4e-15 m2/s for part (b), so the missing figure is pinned by the two
figures that were given.

Two transcription corrections, both in the professor's solution text rather
than in a question. Question 4's solution says the treatment is "at 1325 K"
while its own question and its own arithmetic use 1400 K, so it is transcribed
as 1400 K. Question 7's solution opens "For this platinum-gold diffusion
couple" where the question, the data and the arithmetic are all silver-gold, so
it is transcribed as silver-gold.

The carburizing-decarburizing question is the pack's second with two concepts,
mapped to diffusion at 1.0 and imperfections at 0.5: its hint sends the student
back to the composition conversion of the previous topic before Fick's law can
be applied at all.

### L4, mechanical properties (10 questions)

Nine from the tutorial `Sample question - Mechanical properties 2` (the elastic
strain, elongation and diameter-change problems, the force for a stated
diameter reduction, the candidate-material selection, the structural component,
the three-point bend test, the Brinell hardness pair, and the copper true
stress). The other tutorial file in that folder is a strict subset of it and
contributed nothing new. The tenth is the worked brass example from the lecture
deck `L4 - Mechanical properties`, which is the topic's only figure question.

Every stated answer was recomputed and agrees, including the selection
question's verdict: the applied stress is 350 MPa, which rules out the aluminium
and brass alloys on yield, and the titanium then fails the diameter-reduction
limit at 1.1e-2 mm against 7.5e-3, leaving the steel alone. That
question is mapped to mechanical properties at 1.0 and material selection at
0.6, because choosing between two materials that each pass one criterion is the
selection skill and not the arithmetic one. The three-point bend test is mapped
to mechanical properties at 1.0 and ceramics at 0.5 for the same reason.

Three corrections to the source, all in working rather than in a question.
The structural-component solution computes 659 167 160 Pa and then writes
"= 650 MPa"; it is transcribed as 659 MPa, which is what its own next line
divides by. The three-point-bending solution shows the deflection substitution
with 350 N although the question asks for 310 N, and its own stated answer of
9.4e-6 m is the one 310 N gives (350 N would give
1.06e-5 m), so the substitution is transcribed with 310 N. And the
same solution prints the deflection formula with L rather than L cubed, which
the moment-of-inertia arithmetic and the answer both contradict.

**One question is deliberately held back.** Tutorial question 6 asks whether a
steel specimen under 85 000 N deforms plastically and by how much it extends,
"displaying the stress-strain behaviour shown in Figure 6.22". That figure is a
textbook reference and is in none of the course materials, so part (b) cannot
be answered. Part (a) is computable without it (481 MPa, which is the stated
answer), but shipping half a question would be worse than shipping none, and
pairing it with the brass curve would be pairing it with the wrong material.
It lands as soon as the professor supplies the figure.

**A flag on the brass figure.** The professor uses one annotated version of the
curve throughout the lecture, and it carries the tensile strength (450 MPa) and
the offset yield strength (250 MPa) printed on the plot, so parts (b) and (c)
are read off the figure rather than derived. That is how the professor teaches
it, and the figure is carried unaltered because a figure is never redrawn or
edited; the alternative would have been to drop the topic's only figure
question. Part (a) still requires taking the slope and part (d) still requires
locating point A.
