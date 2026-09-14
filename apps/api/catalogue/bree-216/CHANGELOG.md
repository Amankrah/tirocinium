# bree-216 catalogue changelog

A catalogue is a project asset, reviewed like code and versioned like a prompt
(decision 0062). A revision is a new `vN.json`; an existing file is never
edited in place, because an issued quotation snapshots its lines and the
snapshot is what makes that safe.

## v1

The BREE 216 teaching catalogue, lifted from the course's standalone artifact
by `infra/extract-marketplace-catalogue.mjs`.

Six suppliers: Laurentian Metal Supply (carbon, alloy and structural metals),
Boréal Stainless & Alloy (stainless, duplex and corrosion alloys), Cascades
Polymer & Pipe (thermoplastics, piping and glazing), Terrafibre Composites
(reinforcements, resins and bio-composites), Vulcan Hard Materials (tool
steels, carbides, ceramics and coatings), and Macdonald Fab Works (machining,
welding, heat treatment and finishing). The last of these prices process rather
than stock, which is the point: a material is only as cheap as it is to make
into a part.

146 lines across 33 categories and six units of sale (kilogram, metre, square
metre, litre, each, and the shop hour). Every line carries the fifteen
properties a selection decision needs alongside its commercial terms. 17
project briefs, each naming the selection factors, the candidate families, and
a shortlist of lines; the extractor fails rather than writes if a brief names a
line that does not exist.

Two things were added rather than carried over. Each line gained a
`volatility` band, the half-width of the seeded per-variant price perturbation
that milestone 10.2 applies, assigned by rule from the line's family and then
frozen here as data: 0.02 for shop rates and coating services, 0.06 for
commodity carbon steel, 0.08 to 0.10 for polymers, composites and plain
stainless, 0.16 for the molybdenum-bearing grades, 0.18 for carbide, and 0.20
for nickel and titanium. And prices became integer cents, because money that
has to survive a price break, a tax and a freight estimate should not be a
float.

One deliberate non-change, flagged rather than resolved: the descriptions and
fabrication notes are the course author's prose and use em-dashes throughout,
which the repository style rule forbids in documents. They are carried
verbatim, because normalising someone's teaching copy is an edit to their
teaching and not a formatting pass. Normalising it is a one-pass change to the
extractor if that is wanted.
