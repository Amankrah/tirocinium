# 0108: The supplier desk answers the request for quotation, and a model may now write it

Date: 2026-10-22. Backend and web, marketplace (decisions 0076, 0100, 0101).
Author: backend engineer (Claude), directed by the product owner.

Decision 0076 answered a request for quotation with authored rules and refused
a model call, because a hallucinated engineering note is worse than no note.
The product owner reviewed the result against how an engineer actually gets a
quotation and found it wanting: a student who had answered what a supplier
needs met a list of unconnected sentences, one of them quoting the list price
with a sentence saying their price would differ, and nothing that read as a
reply. That is not what a sales desk sends back, and a surface that exists to
practise buying has to behave like the trade it practises. So the owner
directed that an agent should answer instead, grounded in the catalogue and
the shops, on a cost-effective model. This record supersedes 0076's "the advice
is rules, not a model" paragraph and keeps its reason by other means.

The reply is now written by the supplier desk (`app/marketplace/supplier.py`,
prompt `supplier-reply/v1`): a model that speaks as the inside sales and
application engineering desk of the supplier named, and that is handed a fact
sheet the platform assembled before the model was involved. The sheet carries
the supplier's own policy and shipping terms, the line with its price, minimum,
lead, stock, cutting charge and breaks, the quote arithmetic already run for the
quantity asked (`compute_quote`, so the minimum order, the break, the freight,
the taxes and the total are the same figures a quotation would carry), the
terms every quotation is struck on, the related lines and the process lines it
may name, the authored rules of 0076 as house notes, and the student's request
inside a prompt fence as data. The model's job is the part a rule cannot do:
say back what was understood, state the offer, ask what a firm number still
needs, raise the application points in connection with this request, offer an
alternative only when the request calls for one, and close with the next step.

What makes this acceptable is that the model can be wrong in its prose and
never in its figures. `check_reply` refuses any reply that states a dollar
figure the fact sheet does not carry or names a SKU the catalogue does not
stock, whole rather than patched, and the student then gets exactly what 0076
shipped: the authored notes, with the source stated. The same fallback answers
when no key is configured, when the live call fails, and under the recorded
seam gate of 0064, where the desk is a stub that answers nothing so a seeded
journey can never reach a provider. The rules therefore stay total and stay
reviewable, and they still ship to the model, so an engineering fact lives in
one authored place and the model is asked to carry it, not to know it.

Three smaller choices ride along. A quantity is read as a number and a unit of
sale, and is priced only when the unit is the line's own: "40 kg" of plate is
worked, "2 sheets" is a question the desk asks rather than a guess at a mass,
because a real desk asks. The request gains the two fields a real one carries
and the first form left out, when the part is needed and where it ships to,
both free text. And the reply is stored on the case-study marketplace beside
the request and the notes, with the model id and the prompt version as
provenance (course migration 0024), and each desk call writes a
`supplier_reply` row to `token_usage` in the seat's course shard, on both
marketplaces, because a model call made on a course's behalf is accounted to
the course wherever it was made; the project marketplace still stores no
request, note, reply or quotation.

The model is `claude-sonnet-5-5` by default (`TIRO_SUPPLIER_MODEL_ID`), at
moderate effort with the reply constrained to its schema (decision 0087): the
task is writing with some judgement in it, which the balanced model does well
at a fraction of the stronger one's cost, and the fast model can be pinned
where cost matters more than register. One thing is stated rather than done:
the live reply could not be evaluated in this session, because the configured
key's account had no credit, so the prompt shipped here was reviewed against
the fact sheet and the recorded tests and not against a model's actual output.
`scripts/smoke_supplier_reply.py` is the non-blocking live lane for that
review and should be run, and the prompt revised on what it shows, before this
is called finished.
