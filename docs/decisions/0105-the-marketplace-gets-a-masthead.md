# 0105: The project marketplace gets a masthead, a section strip, and the primitive layer

Date: 2026-10-21. Cross-cutting (web), following decision 0102. Author:
frontend engineer (Claude), directed in design review.

Decision 0102 left the project marketplace alone because it had reached its
prototype a week earlier (0101), and design review then judged its frame the
messiest surface left: the top of every marketplace page was a mono line of
terms, a row of eleven links mixing the six suppliers with the five sections,
a search box and the quote, wrapping to four lines on a laptop and nine on a
phone, with nothing to say which page you were on. The frame is now a masthead
and a strip. The masthead names the place, carries the search (how most
students reach a line) and the quote as a button that turns accent once it
holds anything. The strip is the five sections, marked with the current one;
it is the marketplace's only client component of its own, because the layout
is a Server Component that cannot know the path and a strip that never says
where you are was the jumble's root cause. Suppliers leave the strip: the
front page's directory and a switcher row on each store are where a supplier
is chosen, which is one click more from a brief and one row less on every
page. The terms (currency, taxes, validity, the fictional catalogue) become a
footer line, true everywhere and acted on nowhere. The comparison tray is a
floating sheet rather than a full-width bar, so the page beneath stays
readable. The line card, the filter column, the supplier cards, the comparison
table, the quotation sheet and the request form move onto the 0102 primitives
and tokens (raised and sunken sheets, badges, the segmented look, the table
look), with the price as each card's loudest figure because that is what a
grid is scanned for, and "best" still marked in words, since guide 3.2 keeps
green for variant and recognition states. The shared pieces both marketplaces
use (the catalogue browser, the quotation body, the comparison table, the
request panel) are restyled once, so the case-study marketplace picks the look
up without being redesigned. Nothing about what is kept, priced or sent
changes: every rule of decisions 0100 and 0101 stands.
