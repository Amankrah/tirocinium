# 0106: The materials get pictures, drawn from the catalogue's own swatches

Date: 2026-10-22. Cross-cutting (web), following decision 0105. Author:
frontend engineer (Claude), directed by the product owner.

The product owner asked for images of the materials in the marketplace, stock
or generated. Stock photography was ruled out on its merits: the catalogue is
a hundred and forty-six lines from six fictional suppliers, no licence-safe
photograph exists for most of them, and a photograph of some real supplier's
stainless sheet standing in for a fictional one would be a small untruth on a
surface whose whole point is that its figures can be cited. Raster generation
would need a model call per line, a store for the files and a licence note of
its own. What the catalogue already carries is better: every line names a
swatch (the prototype's fifty-nine material keys, from hot-rolled steel to a
flax weave to the orange of a heat-treatment service), and the prototype
art-directed a CSS background for each. Those backgrounds are now the web
surface's `swatches.ts`, and `MaterialSwatch` draws one as a tile with the
form the category comes in (sheet, tube, bar, pipe, weave, drop, grate, panel,
and gear, flame, lens or arc for the services) as a line motif over it and the
category as a mono caption. Tiles sit at the top of every line card on both
marketplaces, as a hero on the line page, and above each column of the
comparison; the quotation stays a document without pictures, because a
quotation is cited, not browsed. Two rules are kept on purpose. The tile is
decoration beside a name, hidden from assistive technology, never a control's
only content, so nothing a reader needs is in a picture. And the material
hues are the one place a colour is not a token: they are content, like a
figure in a problem, and the chrome around every tile is still the token
layer, which is also why dark mode leaves them alone. A test over the shipped
catalogue pins that every swatch it names is drawn and every category has
decided its motif, so a new line never ships as plain steel unnoticed.
