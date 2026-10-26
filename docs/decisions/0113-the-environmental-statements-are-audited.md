# 0113: The environmental statements are audited, and the figures follow one method

Date: 2026-10-26. Backend, web and catalogue (decisions 0110, 0112). Author:
backend engineer (Claude), directed by the product owner.

The product owner read the environmental section of a process line and found
it wrong from a life-cycle assessment standpoint: it said the footprint of a
process is per unit of process "rather than per kilogram", as if the kilogram
were the natural unit, and that a process "has no water figure", as if water
were a property a process can lack. The functional unit is whatever the goal
and scope define, and every unit process in an inventory has water inputs
whether or not a table records them. The owner then asked that everything the
product says about environmental impact be held to the same standard. This
record is that pass, in two halves: the words, and the figures.

The words were checked against ISO 14040, 14044 and 14046 and Ashby's method,
and three statements were wrong. The carbon-weighted stiffness index
ρ·CO₂/√E was labelled as being for a stiffness-limited tie; it is the beam in
bending index, a tie limited by stiffness scales with ρ/E and a panel with
ρ/∛E, and the label, the comparison row and the guide now say so and state
the three cases. "Cradle-to-gate" was described as ending at the supplier's
gate; it ends at the factory gate, the mill-to-service-centre leg is in
neither figure, and the freight line is now described as an assumed leg from
the supplier to the site at a typical heavy-truck average, stated so a
student can replace it. "Water footprint" was undefined; under ISO 14046 a
water footprint is scarcity-weighted and the catalogue carries an inventory
figure, which the guide and the quotation now say in those terms. Two more
were tightened: carbon negative now means biogenic carbon taken up while the
material grew and held only while it stays in the part, and the quotation's
"average carbon intensity" is named for what the arithmetic does, the whole
basket's carbon, processes included, over the mass of its materials.

The figures were audited line by line against ICE v3, ecoinvent and the
literature, and the per-kilogram material figures and the comparative claims
students are most likely to quote were found sound. What was not sound ships
corrected as catalogue v7, derived from v6 by `scripts/revise_catalogue_v7.py`
and listed in the changelog. The two serious faults were a unit error, five
coating services sold per square metre with figures stated per square
decimetre, so a coated area under-counted a hundredfold, and electric
processes carrying fossil-grid carbon in a catalogue whose shop hours
already sit on the Québec grid. The methodological one was biogenic
accounting applied to some plant-based lines and not others, which made a
bio-core against a bio-skin comparison meaningless; v7 credits storage
uniformly at a stated rate and says so in the course note. The rest are a
recovery rate confused with a process yield, a few embodied energies and
recoveries outside their range, a column of lowest-temperature figures made
consistent across alloy families, and notes whose claims the figures did not
support.

Two rules come out of this and are worth keeping. A figure's unit is the unit
of sale and nothing else, and a note that says "per dm²" on a line sold per
m² is a defect, not a clarification. And an accounting convention applies to
every line or to none: a credit, a boundary, a grid intensity, once chosen,
is a property of the catalogue, stated in its course note, and a line that
departs from it needs a stated reason. The test for v7 pins both: every
coating states its footprint per unit of sale, every electric process sits on
one grid ratio or names what else it burns, and every plant-fibre line
carries the credit.

Left as stated rather than done: the TiN and DLC energies and the Stellite
figure are literature mid-points with low confidence; the aluminium carbon is
a world-average primary where Québec smelters are nearer five, which the line
now says; and the source table has no water figure for any process, so the
blank stays a blank and the copy says it is a gap in the data.
