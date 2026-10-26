# 0114: A piece is ordered by its dimensions, and the shop says what it comes to

Date: 2026-10-26. Backend, web and catalogue (decisions 0076, 0100, 0108,
0112). Author: backend engineer (Claude), directed by the product owner.

The product owner set a real shop's product page beside ours. Metals R Us
sells twelve inches of one-inch tube: the buyer types the cut length within a
stated minimum, maximum and increment, says how many, and is told the shipping
weight, the per-cut charge, the tolerance and the price, with "request a
quote" for anything longer than the stock. Our line sold 6.1 m of HSS by the
metre with a tick for "cut to length" and a count of cuts. A student who
needed four 1.2 m rails had to work out 4.8 m; a student who needed two
300 × 400 mm pieces of 6 mm plate could not say so at all, even though
Laurentian's own policy prices plate "per kilogram of finished cut mass". The
marketplace exists to practise buying, and this is how buying is done. The
guides are silent on a marketplace and silent here.

A piece is ordered by its dimensions. Catalogue v8 gives every line a
`geometry` block, the stock on the rack as numbers and, on the forms sold cut
to size, the cutting rule the shop quotes by; the rules are authored and the
changelog says so. A basket line may now carry `pieces` (a length, a width
where the form has one, a count) instead of a quantity, and
`app/marketplace/cutting.py` turns them into what the quote arithmetic already
prices: a plate piece by its mass from thickness, width, length and density,
which is the service centre's own basis; a bar or tube order by the cut length
in metres, nested first-fit-decreasing into stock lengths with the kerf so the
quotation can say how many lengths it consumed and what is left of the last;
a sheet sold each by the whole sheets consumed, with the offcut stated as the
buyer's; a roll by the area cut off it. The cut charge is per cut piece from
the rule, and the minimum order on the uncut stock is waived, because a cut
piece has a minimum cut instead. A piece the shop would not cut, too short,
off the increment, wider than the plate, longer than the stock, is a stated
refusal in the shop's words and the line is left off, as an unknown SKU is;
the surface points at the supplier desk for the longer piece, as a shop does.

Nothing on the web multiplies anything. The cut-to-size panel on the line
page sends dimensions and a count through the same pricing action the basket
uses and reads back a priced line: each piece's mass, the quantity it comes
to, the cuts and their charge, the stock consumed, the tolerance, the line
total. The basket holds the pieces and the server's figures follow them, the
quote body prints the pieces as a quotation does, and an issued quotation
freezes its pieces beside the rest of the line (course migration 0026) so it
reads back the order it was struck for. The supplier desk's fact sheet carries
the pieces too, so a request about a cut order is answered about that order.

Three things are decided here and worth keeping. The unit of sale is still the
unit of sale: pieces derive a quantity in it, and the price breaks, the
freight on mass and the footprint per unit all run on that derived quantity
unchanged, so a cut order is not a second pricing path. Metric only on the
student side, millimetres and kilograms, because the catalogue speaks them
and a mixed-unit form is where a student's error would hide. And the
geometry must agree with the mass the line already carried: the test derives
mass per metre from each section and density and holds it to the catalogue's
own figure within fifteen percent, so a piece priced by the kilogram and the
same line compared per metre never disagree.

Left as stated: the case-study marketplace's browser still adds lines by the
unit, since it has no line page to carry the panel; the course pack pins v1
and sells by the unit; and a sheet order consumes whole sheets by area without
a nesting of the actual rectangles, which a shop would do on its own software
and which the notice says plainly.
