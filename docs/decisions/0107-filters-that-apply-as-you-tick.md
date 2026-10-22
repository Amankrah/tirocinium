# 0107: Filters that apply as you tick, fold past eight, and say what they did

Date: 2026-10-22. Cross-cutting (web), following decision 0105. Author:
frontend engineer (Claude), directed by the product owner.

The product owner found the marketplace's filter column unusable at the
catalogue's real size: thirty-three categories, a column of attributes and
seven sort radios made a sheet taller than the screen, with Apply at its foot,
so every tick meant a scroll to the bottom and a reload to the top. Decision
0101 made the sheet a plain GET form so filtering works with no script and a
filtered view is a URL, and that stays. Four things change on top of it. The
sheet applies as it is ticked: a small client component listens for a change
on the form, reads it as the query it would have submitted, and navigates to
it on the client with the scroll kept, so the grid updates where the student
is looking; the Apply button is still rendered, in a header that stays put
while the groups scroll beneath it, because without script it is the form.
Each group folds past its first eight behind a native disclosure, with
anything ticked kept above the fold so what is filtering the grid can always
be seen and unticked; the attributes offered are the two dozen most frequent
with their counts rather than the first sixteen alphabetically, which had
hidden "weldable" behind "4-year". The sort is one select rather than seven
radios. And what is applied is said above the results as chips, each a link to
the same view without that one filter, with the sort shown when it is not the
catalogue's own, so a student never has to look at the column to know what
the grid is. The chips are links and the fold is a details element, so the
whole sheet still works with script off, and the one script is the
convenience of not pressing Apply.
