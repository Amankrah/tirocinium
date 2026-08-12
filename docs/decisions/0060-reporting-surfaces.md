# 0060: The reports render nulls as words, and draw their one chart from the token layer

Date: 2026-08-11. Milestone 8.3 (web). Author: frontend engineer (Claude).

The four course reports are dense reads with no interaction, so the whole route
is Server Components and ships no client JavaScript beyond the shared baseline,
which is the cheapest way to honour guide 5 on a surface that would otherwise
invite a charting library. The two properties decision 0048 built into the data
are carried into the copy rather than smoothed away. A statistic with an empty
denominator arrives as null and renders as "Not enough yet" through a single
helper every view uses, because a course with no machine-verified variants
printing "0% passed", or one with a single rubric pair printing a correlation,
would read as a finding when it is an absence; the test that pins this asserts
the words appear and that no zero does. And usage with no configured prices
renders the real token and speech counts beside "Not priced" rather than a
currency zero, since prices are configuration and an invented number in a cost
report is worse than no number. Activity is rendered in the order the backend
returns it, by seat number, and the surface says so in a line, because the only
thing stopping a reader from re-sorting a table by submission count is knowing
that ranking students is a thing this product deliberately does not do.

The recognition-confidence distribution is the one chart in the product, and it
is built from the token layer: ten hairline bars in the accent colour with
tabular counts beside them, not a charting dependency. Three reasons, in order
of weight. The design language organises with rules and margins and spends its
one visual flourish on the particle field, so a charted panel would be the
second signature moment in a product specified to have one. A dependency here
would have to state its bundle cost against the 170 kB budget for a figure that
is ten numbers. And any library ships its own palette, which would mean either
inventing colours outside the specified tokens or fighting the library to match
them; the guides are explicit that tokens are matched, not invented.
