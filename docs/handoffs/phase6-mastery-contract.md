# Handoff: the Phase 6 mastery contract is live

From the backend session to the frontend session. The Phase 6 backend is
complete (decisions 0040, 0041): evidence flows from every processed
submission, the model computes labels, and the three surfaces 6.4 renders
have their endpoints. The seam is regenerated (`schema.ts` committed) and the
full backend gate is green, including the seven-day trajectory and the
transactionality tests. Shapes below.

## The student's mastery picture (course home and history)

`GET /api/v1/courses/{course_id}/mastery`, seat token only (a professor gets
403; the professor's lens is the distribution below). Returns every concept
in the course, in the professor's display order:

    {
      "concepts": [
        {
          "concept_id": 7,
          "name": "Ohm's law",
          "description": "V = IR" | null,
          "label": "unseen" | "shaky" | "developing" | "solid",
          "m_eff": 0.82,
          "retention": 0.91,
          "due_for_revisit": false,
          "trail": [
            {"at": 1690000000, "text": "Correct final answer."},
            {"at": 1689900000, "text": "Fading: last practiced 19 days ago. ..."}
          ]
        }
      ]
    }

The transparency contract is already satisfied server-side: the trail ships
with every label (newest first, at most five event lines plus a decay line
when decay is the story), so the frontend rule is only "never render the
label without offering the expansion". Unseen concepts arrive explicitly with
an empty trail; render them quietly, they are not an error. The wording of
trail lines comes from the model itself; show it verbatim.

## The revisit queue (course home)

`GET /api/v1/courses/{course_id}/revisit`, seat token only:

    {
      "concepts": [
        {
          "concept_id": 7,
          "name": "Ohm's law",
          "variant": {
            "variant_id": 41,
            "case_study_id": 3,
            "case_study_title": "The RC circuit"
          } | null
        }
      ]
    }

Ordered most faded first, one targeted variant each (highest-weight published
case study, nothing attempted in the last 48 hours, an unattempted variant
from the pool). A null variant means nothing suitable exists right now; show
the concept without a call to action rather than hiding it. An empty list is
the normal, calm state. The variant links into the existing problem view and
upload flow by its ids; completing it is just evidence like any other.

## The professor's distribution (per-concept view)

`GET /api/v1/courses/{course_id}/mastery/distribution`, professor-and-owner:

    {
      "concepts": [
        {
          "concept_id": 7,
          "name": "Ohm's law",
          "unseen": 12, "shaky": 4, "developing": 9, "solid": 3,
          "gaps": []
        }
      ]
    }

Counts only; no per-seat identity appears anywhere in the shape, by design.
`gaps` is always present and always empty until Phase 7's defense rubrics
start naming misconceptions verbatim; design the slot, expect it empty.

## Grading (review surface)

`POST /api/v1/courses/{course_id}/submissions/{submission_id}/grade` with
`{"score": 0.85}` (0 to 1; map whatever scale the professor grades in before
sending), professor-and-owner. Returns
`{"submission_id", "score", "graded_at"}`. Server-side this is ground truth:
it supersedes the submission's automatic evidence in the same transaction, so
a student's picture can visibly recover from a misread scan the moment the
professor grades it. Re-grading is allowed and simply supersedes again. 404
for an unknown submission.

## What happens without any frontend work

Evidence emission is a worker stage: every submission that reaches
`processed` now also produces `answer_match` (when the variant's final
answers are numerically comparable and legible) and `working_assessment`
events automatically. Nothing to wire; the mastery picture simply starts
moving once students submit.

## Still backend-side, not yours

The defense-rubric evidence source and the `gaps` content (Phase 7), the
professor's individual-seat history view (Phase 8), and the live-model smoke
lane for the new prompts.
