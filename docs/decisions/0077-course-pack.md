# 0077: the course pack, and why a professor's own question is a manual variant

BREE 216 needed its practice questions in the platform, and the platform had
two ways to get content in: a professor types a case study into the authoring
UI, or a professor uploads a PDF and the Phase 4 import pipeline segments it
into staged items they confirm one by one. Neither fits a whole course arriving
at once from a folder of tutorials, lecture decks and answer keys that were
never one document and never will be. Typing sixty-five questions with their
worked solutions and their mathematics is not authoring, it is transcription
with a keyboard; and the import pipeline is built to read one PDF a professor
chose to import, not to sweep a directory tree of PowerPoint exports whose
questions and answers live in different files.

The guides are silent on bulk course content, so this records the third way in.
A **course pack** is one course's taught content as a versioned file asset:
`apps/api/coursepack/{id}/vN.json` beside a `CHANGELOG.md`, loaded the way
`app.prompts` loads a prompt and `app.marketplace` loads a catalogue, and for
the same reason. It is reviewed, diffed and versioned like code, nothing at
runtime edits it, and a revision is a new file rather than an edit in place.
It holds the course's concepts, its questions with the professor's own worked
solutions and final answers, and the figures those questions read from.

## Each question becomes a manual variant, and that word is load-bearing

A case study alone is not practisable in any useful sense. The understanding
unfold splits a *variant's* stored solution into steps, the defence tutor holds
a *variant's* reference solution as ground truth, and `answer_match` compares a
transcription against a *variant's* final answers. So the loader writes each
question as a published case study plus exactly one variant, seed zero, marked
`manual`.

`manual` is not a shortcut past verification. It is the state milestone 5.3
already defines for a variant the professor stands behind rather than one a
model generated and a second model checked, it is servable
(`pool.SERVABLE_STATES`), and it is the accurate statement about where this
text came from: a human wrote it and no model touched it. The consequence is
the good one. A pack question is servable the instant it lands. The practice
read hands it to a student with no generation, no pool fill, and no model call
anywhere on the path, which is also why loading a course costs nothing and
works with no API key configured at all. `model_id` records `course-pack` and
both prompt-version columns record the pack revision, because those columns are
provenance and the honest answer is that no model and no prompt produced them.

## Figures are committed bytes, not a path into the professor's folder

The materials folder is two gigabytes of lectures, videos and textbook scans
and is not in the repository. A pack that resolved figures out of it at load
time would work on the one machine that has it and fail on every other, so the
bytes come with the pack: `figures/{sha256}.png`, tracked in Git LFS like every
other captured asset, with the declared hash verified on load rather than
trusted. `scripts/extract_pack_figures.py` is what puts them there, and it does
it through `platform_core.pdf.extract_figures`, the same deterministic
extractor the import pipeline uses, so an embedded raster comes out of the PDF
stream byte for byte. Nothing is redrawn, re-encoded or described. Each figure
records the document, page and normalised bbox it came from, in decision 0032's
frame, so the copy stays traceable to the professor's original.

One distinction inside that constraint is worth stating, because it looks like
a softening and is not. A unit cell diagram is a figure and is carried as
pixels. The professor's "head coordinates, tail coordinates, coordinate
differences" answer table is *text* that happens to have been pasted into a
slide as a picture, and it is transcribed as a markdown table. As text it can
be split into steps by the unfold and read by the tutor; as a picture it can be
neither, and a solution nobody can step is not a solution the platform can
teach from.

A body names a figure by the pack's own key (`![alt](pack:l1-directions-cell)`)
rather than by a `fig://` id, because the id is a shard row that does not exist
until load time. The loader rewrites the scheme once it has the row, which is
what lets one pack load into any number of courses.

## Loading is idempotent, and the identity map is why

`course_pack_items` (course migration 0022) maps `(pack_id, item_key)` to the
case study and variant it produced. Without it a reload would be a second copy
of the course; with it, a pack revision lands on the row a student's history,
submissions and mastery evidence already point at. The key is the pack's stable
item key and never the title, because a professor may retitle a question and
that must not orphan what it already produced. It is a side table rather than a
column on `case_studies`, because a case study authored in the UI has no pack
and should carry no pack column, and a question later dropped from the pack
leaves its case study standing: the professor's content outlives the asset that
seeded it.

## What this does not do, and the constraint it sits against

"The AI proposes and the professor disposes" says nothing extracted or
generated becomes student-visible without explicit professor confirmation, and
a pack loads straight to `published`. The confirmation has not been skipped; it
has moved. The reviewed artifact is the pack file itself, read and approved
topic by topic before it is committed, exactly as the marketplace catalogue is
reviewed before it ships. What the constraint forbids is a pipeline whose
output reaches students without a human in it, and the human here is the one
reviewing the diff. Two consequences follow and both are deliberate: the loader
reports what it created and updated rather than working silently, and it will
never mint a professor account, because the one way to make an account is the
product's signup.

The transcription itself is not neutral and the changelog says where it was not
faithful. Two corrections to the L1 source are recorded there rather than made
quietly, and the second is the kind that matters: a question stating "radius"
whose own answer uses the number as a lattice parameter would have the tutor
mark correct work wrong, holding the professor's solution as ground truth
against a student who read the question as written.
