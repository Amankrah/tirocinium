# bree-216 catalogue changelog

A catalogue is a project asset, reviewed like code and versioned like a prompt
(decision 0076). A revision is a new `vN.json`; an existing file is never
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

## v2

Corrections after an audit of v1 against handbook values, section geometry
and the suppliers' own policies (decision 0108), derived from v1 by
`scripts/revise_catalogue_v2.py`, which is the whole of the difference and is
written as data. Nothing was added or removed: the same 146 lines, the same
SKUs, the same shortlists, so every brief and every course pack still resolves.

Figures students compute against. The 50 × 50 × 4.8 HSS mass falls from 8.62
to 6.4 kg/m, and the 76 mm tube's spec moves to the 6.4 mm wall its 14.17 kg/m
was always true for, so the $/kg and freight lines of the greenhouse brief now
follow from the sections stated. The 2205 duplex tube rises from 1.77 to 2.38
kg/m, the mass of the wall its spec names. The four Vulcan coating services
and Macdonald's electropolishing were priced per square decimetre, as the
policies say, but sold per square metre, so any coated area came out a hundred
times too cheap; the figure is now the per-metre one with the per-decimetre
rate stated in the spec, and the four coatings are flagged as the services
they are. CPVC Schedule 80 at 82 °C is 100 psi, not 200. The rotational mould
setup rises from $3,400 to $18,500, a figure a tank mould can be bought for.

Properties. 5160 spring bar and 1045 shafting bar carried their quenched and
tempered figures while the spec and the fabrication note described the bar as
bought; both now carry the as-supplied values, and the hardened figures live
in the description as what the heat treatment buys. Black HDPE pipe is rated
5 for UV, as its own copy says, and Schedule 80 PVC carries the same rating
as the Schedule 40 of the same compound.

Terms. Minimum orders now match the suppliers' notes: one full length on
Laurentian's structural sections, 25 kg on its plate and sheet, 10 kg on
Boréal's sheet and plate, one piece on Vulcan's blanks. Six-metre straight
pipe lengths are long loads for freight like the three-metre bars already
were. Manual shop time is billed in 0.25 h increments, as Macdonald's policy
says.

Copy. Eleven descriptions and four fabrication notes stated a comparison the
figures on the same line did not support (the FRP tube is heavier than the
aluminium tube, not lighter; carbon fibre has about three times E-glass's
fibre modulus, not thirteen; alumina is a thirtieth as tough as mild steel,
not a hundredth; and so on) and now state the one they do. The rewrites are
the only lines whose copy is not the course author's verbatim, and they carry
no em-dashes.

What moves to v2: the project marketplace for any seat whose course has not
pinned a catalogue, since it takes the newest shipped version. A course
pinned to v1 stays on v1 until its professor re-pins, and an issued quotation
is untouched either way. The course pack still pins v1.

## v3

The environmental layer from the BREE 216 L9 indicator table (decision 0110),
derived from v2 by `scripts/revise_catalogue_v3.py`, which reads that table
and is the whole of the difference. Same 146 lines, same SKUs, same prices,
same mechanical properties except embodied energy, which takes the L9 figure
where the table names one (reinforcing bar moves from 22 to 11 MJ/kg; A36
stays 24). Indicator rows for lines this catalogue does not stock, including
the packaging supplier, are not added.

What the layer adds, per kilogram and cradle-to-gate: carbon footprint, water
footprint, a realistic end-of-life recovery, the lowest useful service
temperature, and a sentence on the end-of-life route. Recovery is stored
beside the property-sheet recyclability and does not replace it, so the gap
stays visible (A36 is 98 % recyclable on the sheet and 88 % recovered). A
process has no mass, so machining, welding, heat treatment and coating carry
energy and carbon per unit of process instead, and a documentation-only line
carries zero rather than a blank. A figure the table does not give stays
absent. Carbon may be negative, where the supplied material stores more than
its production emitted.

What moves to v3: an unpinned project seat, because v3 is the newest shipped
version. A course pinned to v1 or v2 stays there until its professor re-pins.
Re-pinning does not rewrite an issued quotation. The course pack still pins v1.
