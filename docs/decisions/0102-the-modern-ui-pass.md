# 0102: The modern UI pass: a primitive layer, two real shells, and the public thresholds

Date: 2026-10-21. Cross-cutting (web). Author: frontend engineer (Claude),
directed in design review.

Design review judged the shipped surfaces an unstyled prototype of a strong
specification: the token layer, the copy and the accessibility work were in
place, but every page was a narrow centred column of bare text, section
navigation inside a course was a row of underlined links at the top of one
page, status was coloured text, and the hero still rendered as a filled grey
slab. Guide 1 asks for a flagship product with ambition spent deliberately, and
guide 3.2 lets cards and shadows be used sparingly; this pass spends that
allowance. The token layer gains surfaces (a raised sheet one step lighter
than the paper, a sunken recess one step darker), three tints of the existing
hues for chips and selected states, two warm low shadows, and a radius scale;
no new hue enters the palette and every pinned value and audited pair is
unchanged, so dark mode comes with the tokens. On that layer sits a small
primitive set in `components/ui` (button with four variants and three sizes,
field controls, card, badge, page header, section heading, empty state,
segmented link navigation, table, stat, keyboard key, wordmark, and a stroke
icon set drawn inline so no dependency and no client runtime are added), all
Server Components, which is what keeps the content routes under the guide 5
script budget. The professor shell grows a course rail (a sidebar on wide
screens, a scrolling tab row on narrow ones) so the seven places a professor
works are one click from every one of them; the student shell gains a
segmented course/marketplace switch and a seat chip. The landing, the seat
entry and the credential screens share one threshold: the wordmark over graph
paper, the form on a raised sheet, and the hero's still thinned to a dashed
curve over a faint wash so the copy on it is never crowded. Two rules the pass
keeps on purpose: nothing animates ambiently but the field, and the icons are
decoration beside a label, never a control's only content. The marketplace
(decisions 0100 and 0101) inherits the shell and the primitives and is
otherwise untouched, since it reached its prototype a week ago and a second
restyle on top would be churn, not design.
