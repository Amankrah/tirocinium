# 0062: the materials marketplace, and why its prices ride the variant seed

A student who has chosen AR400 over A36 has done half of an engineering
decision. The other half is what it costs, what the minimum order is, how long
it takes to arrive, and what the fabrication route adds, and none of that was
anywhere in the platform. The four guides are silent on a marketplace because
the platform they describe ends at the worked solution. This decision records
the extension: a catalogue of suppliers, materials and fabrication services
that a student quotes against while solving a case study, and the quotation
that comes out of it, which becomes part of the record the tutor defends.

The content originates in a teaching artifact built for BREE 216, Bioresource
Engineering Materials: six fictional Québec suppliers, 146 stocked lines
spanning carbon and alloy steels, stainless and corrosion alloys,
thermoplastics and glazing, reinforcements and bio-composites, tool steels,
carbides and ceramics, and the fabrication services that turn any of them into
a part. Each line carries the properties a selection decision actually needs
(density, yield and tensile strength, modulus, elongation, fracture toughness,
conductivity, expansion, service ceiling, corrosion and UV ratings,
food-contact approval, embodied energy, recyclability) alongside its commercial
terms (unit price, minimum order, lead time, stock state, cut fee). The schema
is deliberately general and the catalogue is deliberately not: nothing in the
tables knows it is about bioresource engineering, so a second discipline
arrives as a second catalogue file and not as a migration.

## Prices are seeded, not fixed

The load-bearing choice is that a price is not a property of a SKU. It is a
property of a SKU and a variant together, derived by a pure function of the
line's identity and the variant's existing seed. Two students working the same
case study already hold different numbers, because that is what the variant
pool is for; a fixed price list would have handed them back a shared answer at
the exact point where the answer becomes a dollar figure, and a quotation is
the most copyable artifact the platform has ever produced. Seeding the prices
closes that, and it does it without a second seed, a second store, or anything
for the professor to configure.

It also happens to be true to the trade. The catalogue carries a per-line
volatility band rather than one global percentage, because the suppliers' own
copy already says so: commodity mild steel barely moves, 316L carries a nickel
and molybdenum surcharge that shifts weekly, and a shop rate does not move at
all. The bands are authored, narrow enough that the comparisons the briefs are
built to teach survive every seed, and wide enough that a student who assumed a
classmate's figure would transfer is wrong. Money is integer cents throughout,
in Python, as a pure function alongside `app/variants/sampling.py` rather than
in Rust: this is the same authoring-time arithmetic that decision 0030 kept in
Python, not the mandated-Rust numeric comparer or the mastery model.

A quotation, once issued, freezes. Every line snapshots its description, unit,
quantity, unit price and extension at issue, so the artifact survives a
catalogue revision exactly as a real quotation survives the next price list.
That snapshot is also what makes the shard boundary work: the catalogue is
cross-course platform content and lives beside `mastery_params` in the
directory, quotations live in the course shard, and the two meet in Python at
the read, never in SQL.

## The advice is rules, not a model

The request-for-quotation surface answers with application-engineering notes:
that a chloride-bearing service will eat galvanising, that 3-A compliance drags
orbital welding and passivation into the cost model, that at prototype volume
the minimum order and not the unit price will dominate. Every one of those is a
deterministic rule over the answers the student gave and the line they named.
No model call, no versioned prompt, no recorded seam.

That is a deliberate refusal rather than a saving. Engineering advice to a
student who cannot yet judge it is the worst possible place for a fluent
paraphrase of a plausible-sounding rule, and the platform's own constraint that
the AI proposes and the professor disposes points the same way: this content is
authored, reviewable, and diffable, and it is wrong only in the ways someone
chose. The rules live as data beside the catalogue for the same reason the
dashboards do.

## What the tutor sees

The defence context assembled three sources, and now assembles four. The
student's issued quotation joins the variant, the reference solution and the
transcription, as delimited untrusted content like the rest, because a
quotation the student built is the student's own work product in exactly the
sense their handwriting is. The persona moves to `defense-tutor/v3` and gains
one rule: the tutor may press on why this material, why this grade, why this
quantity and what the cost basis was, and may never name the material it would
have chosen. Naming it would reveal the answer through the side door the
never-reveal rule exists to close, and a cost defence has no single right
answer to reveal in the first place.

A submission cites a quotation the way it cites an attempt, and on the same
terms as decision 0058: the citation is checked inside the creating transaction
rather than trusted, a quotation belonging to another seat or another variant
contributes nothing, and a submission without one carries a null rather than an
empty basket. Nothing about the quotation is graded arithmetically. It is
evidence for the conversation, and the conversation's rubric is where it
reaches the mastery model, which keeps this extension from inventing a
parallel scoring path the mastery specification does not describe.

## Flagged, not resolved

The `tirocinium-conventions` and `tirocinium-testing` skills cite decisions
0055, 0059, 0060 and 0061, and no such files exist in `docs/decisions/`. The
numbers are therefore treated as reserved and this record takes 0062. The
conflict between the skills and the directory is recorded here rather than
repaired, because repairing it means writing four decision records for work
someone else did and would put words in their author's mouth.
