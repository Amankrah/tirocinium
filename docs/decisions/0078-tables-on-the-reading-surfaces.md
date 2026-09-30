# 0078: tables on the reading surfaces, and the twin that has to match

Loading BREE 216's second topic put the first table in front of a student, the
Hume-Rothery comparison of twelve elements against copper, and it rendered as a
paragraph of pipe characters. `react-markdown` ships CommonMark, and tables are
GitHub Flavored Markdown, so nothing was broken: the surface had simply never
been asked for one. Every reading surface in the product shared the omission,
and so did the client twin behind the practice swap.

This adds `remark-gfm` to both renderers. The reason it is worth a dependency
rather than a house rule against tables is that a materials course states its
data in tables and cannot avoid them: the Hume-Rothery criteria, the
crystallographic answer tables of L1, the readings taken off a phase diagram,
a stress-strain series. Writing those as prose or as nested lists would be
formatting the professor's teaching around a limitation of ours, which is the
same objection that kept the catalogue's em-dashes intact in decision 0076.
The alternative of carrying each table as an image was worse still: it is text,
and as an image it could be neither split into steps by the unfold nor read by
the tutor.

The cost is close to nothing where it matters. `ProblemBody` is a Server
Component, so on every server-rendered read the plugin runs on the server and
never reaches a browser at all. The client twin that does ship it is already
lazy-loaded behind `next/dynamic`, so it lands in a chunk a student only
downloads if they press "New variant". The practice route moved from 114 kB to
117 kB against the 170 kB budget, and nothing else moved.

Two things about it are load-bearing.

The plugin lists on the two renderers must stay identical. They are separate
files with duplicated configuration, and the twin renders the same professor's
markdown after a swap, so a plugin present on one side and absent on the other
shows up as a table that silently reformats itself mid-session. That is the
server and client drift decision 0068 warned about in a different guise, and it
is now pinned by a test that renders the same table through both and compares
what a reader gets rather than the markup.

And GFM brings autolink literals, which turn a bare URL into a link. A body can
carry transcribed student handwriting, so that is untrusted text gaining a new
way to produce an anchor. It is safe because the `urlTransform` already on both
renderers is unchanged: `fig://` passes through and everything else goes to
react-markdown's default sanitizer, which is what strips a `javascript:` href.
A test asserts that specifically, because the reasoning is only as good as the
thing it claims about a sanitizer still being in the path.

The table styling is drawn from the token layer rather than a dependency, the
same rule the reports' bar charts follow: the hairline for row rules, muted ink
under the header, and the table scrolling inside its own container so a wide one
never widens the reading column. That last part is the rule display math already
follows, and the reason is the same.
