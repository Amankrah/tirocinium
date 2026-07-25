# 0036: The parameter spec's shape and where the frozen check runs

Milestone 5.1 stores the guide 6.1 spec JSON with one extension: every parameter
carries a `base` field, the value it has in the base case study's text, because
both the figure-frozen check (is this value printed inside a figure?) and
rendering the base scenario need it and the guide's representative JSON, being
representative, omits it. Entity parameters get an optional free-text
`description` guiding coherent replacement, parameter names are constrained to
clean identifier tokens (they become source tokens), and the editor surface is
`GET`/`PUT`/`DELETE` on `.../case-studies/{id}/param-spec`, professor-and-owner,
the spec compressed into the existing `param_spec_z` column with the
problem-text dictionary. The frozen check runs inside the PUT, not in a worker:
a save must be refused synchronously with per-parameter reasons (a 409 problem
whose `blocked` extension the handler now supports), and its cost is bounded
because each figure's displayed values are read once ever, cached in
`figure_readings` by content hash (migration course/0013) behind a `FigureReader`
seam (Anthropic live under `prompts/figure-reading/v1`, recorded in tests), so
only a figure's first-ever check pays a vision call, a small bounded number per
case study. Matching is deliberately literal, in Python (this is authoring-time
string matching, not the mandated-Rust numeric comparer): numeric tokens parsed
from the display strings compared with a relative tolerance, case-insensitive
containment for choice and entity values; unit-conversion equivalence ("8%" for
0.08) is out of scope until real corpora justify it.
