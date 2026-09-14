# 0074: The premium palette refinement

Date: 2026-09-14. Milestone 9.6 (web). Author: frontend engineer, directed in
design review.

Design review judged the launch palette too generic: bright interface blue on
clinical near-white read as a default, not a workbook. Guide 3.2 calls its
values "a starting point, to be refined in design review", the clause decision
0062 used for the contrast corrections, so this refinement is in-spec and the
guide's identity (ink on paper, one workbook accent) is unchanged. Paper warms
from #FAFAF7 to the cream #F7F4EC and the hairline warms with it to #E6E1D3,
because real workbook paper is cream; the accent deepens from #2C5AE9 to
#3B5BDB, fountain-pen ultramarine rather than interface blue. The accent's
luminance is chosen inside the band the contrast audit enforces, light enough
for a 3:1 focus ring on the dark ground and dark enough for on-accent text at
5.4:1, and every audited pair in both themes still clears its threshold, which
is precisely what makes a refinement like this safe to attempt. Ink, the two
state colours, and the dark theme are unchanged; the token layer means every
surface picks the refinement up with no component edits.
