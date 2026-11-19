# 0116: The catalogue stocks the materials project groups asked for

Date: 2026-11-19. Backend, web and catalogue (decisions 0076, 0110, 0114,
0115). Author: backend engineer (Claude), directed by the product owner.

BREE 216 project groups wrote to the course team that three materials they
meant to research were not in the marketplace: S-glass fibre, a
carbon-reinforced glass fibre, and borosilicate glass. The course team said
they would be added. They become catalogue v9, derived from v8 by
`scripts/revise_catalogue_v9.py`, which writes each new line out whole as data
and changes nothing that v8 already carried, so a quotation or a challenge
selection made against v8 reads the same 146 lines in v9 (`test_catalogue_v9.py`
asserts it). Each line went to the supplier that already sells its neighbours:
the S-2 glass satin (`TFC-SG-300`) and a half-carbon, half-E-glass hybrid twill
(`TFC-CGH-200`) to Terrafibre beside its carbon twill, and a 5 mm borosilicate
3.3 sheet (`CPP-BORO-5`) to Cascades among the glazing, sold by the sheet and
scored and snapped to size with no kerf. Like the v4 requirement statements,
the figures are the engineer's, from handbook values for the two glasses and,
for the hybrid, the mass-weighted means of the carbon and E-glass lines already
stocked, stated as such in its note; the prices are set to sit where those
lines' prices put them. The course author should review them, and that review
lands as a later revision. Two choices are worth naming. The E-glass lines
state laminate figures while the carbon and basalt lines state the fibre's,
which v1 inherited and nobody has reconciled; S-glass follows the
high-performance fibres and its description tells the student to compare like
with like, rather than this revision quietly changing the E-glass lines. And
the new lines join no brief or shortlist, because a shortlist is the course
author's statement about a problem. An unpinned project seat meets v9 as the
newest version; a pinned course stays where it is until re-pinned. On the web,
the hybrid and the glass get drawn swatches of their own (`hybridcg`, `boro`)
and no photograph, since no kept Commons file depicts either (decision 0115),
and `swatches.test.ts` now reads every shipped version instead of only v1, so a
line that a later revision adds cannot arrive undrawn.
