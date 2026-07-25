# Handoff: the Phase 5 parameterization contract is live

From the backend session to the frontend session. The Phase 5 backend is
complete (milestones 5.1 to 5.4, decisions 0036 to 0039), so everything 5.5
needs exists: the parameter spec panel, the auto-parameterize overlay, the
review queue, and instant variant swapping in the practice loop. The seam is
regenerated (`schema.ts` committed, typecheck green) and the full backend gate
is green. Shapes and behaviours below, in the order the panel meets them.

## The parameter spec (editor panel)

`GET /api/v1/courses/{course_id}/case-studies/{case_study_id}/param-spec`
returns the saved spec or `404` when none is saved (the panel's empty state,
not an error). `PUT` the same path saves the whole spec and returns it;
`DELETE` clears it (`204`). All professor-and-owner.

The spec's wire shape (also what auto-parameterize proposes):

    {
      "parameters": {
        "discount_rate": {"type": "number", "base": 0.08, "range": [0.04, 0.12], "step": 0.005},
        "cashflow_years": {"type": "integer", "base": 5, "range": [4, 8]},
        "company_sector": {"type": "choice", "base": "logistics", "options": ["agri-processing", "logistics", "retail"]},
        "company_name": {"type": "entity", "base": "Veltri Freight", "description": "a small regional company"}
      },
      "invariants": ["The NPV must be positive in the base scenario"],
      "solution_method": "Discount each year's cashflow and sum." | null
    }

Every parameter carries `base`, the value it has in the base text; names are
`^[a-z][a-z0-9_]*$`. Validation failures are `422`.

**The frozen check runs on save.** A `PUT` whose parameter's base value is
printed inside an essential figure is refused with `409` and a `blocked`
extension on the problem body, one entry per conflict:

    {
      "type": "about:blank", "title": "Conflict", "status": 409,
      "detail": "Some parameter values appear inside a figure.",
      "blocked": [
        {
          "parameter": "resistance",
          "figure_id": 3,
          "value": "4.7 kΩ",
          "reason": "4.7 kΩ appears in Figure 2, so this value can't vary unless the figure is decorative."
        }
      ]
    }

Show the reason as given; the two escape hatches are the existing figure verb
(mark decorative, `PUT .../import-items/{item}/figures/{figure}` with
`{"role": "decorative"}`) or editing the value out of the prose. Nothing is
stored on a 409.

## Auto-parameterize (the overlay)

`POST /api/v1/courses/{course_id}/case-studies/{case_study_id}/auto-parameterize`
(no body; send an `Idempotency-Key`, retries replay the identical response).
Returns `200`:

    {
      "proposal_id": int,
      "spec": { ...exactly the PUT shape above, ready to save... },
      "annotations": {
        "discount_rate": {
          "rationale": "The rate drives the discounting without changing the method.",
          "literal": "0.08",
          "positions": [[31, 35]]        // [start, end) char offsets into the question markdown
        }
      },
      "invariant_rationales": ["Keeps the decision from flipping unintentionally."],
      "frozen": [ ...the same blocked shape as the 409, for the lock chips... ],
      "provenance": {"model_id": str, "prompt_version": "auto-parameterize/v1"}
    }

`positions` are server-verified: they always point at real occurrences of the
literal in the current question text, and an unfindable literal has an empty
list (render its chip without a highlight rather than guessing). `frozen`
values arrive already excluded from `spec`, each with its lock reason; the
overlay's "AI-proposed" note can hang off `provenance`. The proposal is a
draft: accepting it is just the `PUT` above, and the backend logs how much of
the proposal survived that save as its own quality signal, no frontend work
needed. The call takes a few seconds (one model call, plus one per not-yet-read
figure): a quiet in-overlay pending state is right, not a route spinner.

## Preview and pool generation

`POST /api/v1/courses/{course_id}/case-studies/{case_study_id}/variants` with
`{"count": 3}` (1 to 20, professor-and-owner) enqueues seeded background
generation, `202`:

    { "enqueued": 3, "seeds": [int, ...] }

With an `Idempotency-Key`, the same seeds come back on retry, so double
submits cannot double spend. `409` when the case study has no spec yet. There
is no per-job progress stream; poll the list below (generation of one variant
is two model calls, tens of seconds). "Generate preview variants" is this with
`count: 3`, then rendering the three results from the list.

Publishing a spec'd case study auto-fills its pool of 20 in the background;
no frontend call needed beyond the existing publish.

## Reading variants (list, review queue, diff)

`GET .../case-studies/{case_study_id}/variants?state=&cursor=&limit=` is
professor-and-owner, cursor-paginated like every list. `state` is `verified`,
`flagged`, or `manual`; the review queue is `?state=flagged`. Items:

    { "id", "seed", "verification", "flag_reason", "model_id", "created_at" }

`flag_reason` is honest professor-facing copy ("The independent re-solve
disagrees with the solution.", "The variant altered the base's figure
tokens.").

`GET /api/v1/courses/{course_id}/variants/{variant_id}` is the diff read:

    {
      ...the summary fields above,
      "body": str,                       // fig:// tokens intact, same figures as the base
      "solution": str,                   // the generation pass's worked solution
      "final_answers": [str],
      "verify_solution": str | null,     // the independent re-solve, for the side-by-side diff
      "values": {"discount_rate": 0.06, "company_name": null},
      "verify_model_id": str | null,
      "generation_prompt_version": str | null,
      "verification_prompt_version": str | null
    }

Review verbs, all professor-and-owner:

- `POST .../variants/{id}/promote`: flagged becomes `manual` (serves like
  verified). `409` if not flagged.
- `PATCH .../variants/{id}` with `{"body"?: str, "solution"?: str}`: an edit
  always lands on `manual`; the professor took responsibility.
- `DELETE .../variants/{id}`: `204`, or `409` when submissions reference it.

## The practice loop (student-facing)

`GET /api/v1/courses/{course_id}/case-studies/{case_study_id}/practice-variant?exclude={current_variant_id}`
for any course reader (seats see published only). Always instant, `200`:

    { "variant_id": int | null, "body": str }

A random servable variant, preferring one other than `exclude`; a null
`variant_id` means the pool has nothing servable yet and `body` is the base
case study, which renders identically (the guide's rule holds: no generation
spinner exists anywhere in the practice loop, because the backend never
generates on this path). Solutions never appear here. Variant bodies carry the
same `fig://` tokens as the base and the existing figure resolver serves them
unchanged for published case studies.

## Still backend-side, not yours

Item/figure split (deferred on the five-PDF corpus, with figure re-crop), and
the Phase 5 live-model smoke lane. The `manual` state already serves; no
special casing needed beyond showing it as "promoted by you" if you want the
distinction.
