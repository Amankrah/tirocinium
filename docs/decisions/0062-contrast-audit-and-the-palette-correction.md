# 0062: The contrast audit, and correcting two palette values the AA floor rejects

Date: 2026-08-12. Milestone 9.3 (web). Author: frontend engineer (Claude).

The audit computed every foreground-on-background pair the product actually
renders, in both themes, at the threshold each pair's role demands, and found
four failures. Three are dark-mode only and exist because the dark block in
`tokens.css` overrode four tokens and left the rest at their light values: the
accent as link text reads 3.28:1 on the dark ground, verify-green 3.51:1, and
flag-amber 4.35:1, all against a 4.5:1 requirement, and all used at `text-sm` or
`text-xs` where the large-text allowance never applies. The hairline was worse in
a way contrast maths does not capture: `--color-rule-line` never inverted at
all, so structure rules rendered at 14.40:1 on the dark ground, which is not an
accessibility failure but near-white gashes across a near-black page. The fourth
is in both themes: form fields drew their boundary in that same hairline at
1.22:1, and a field's boundary is a UI component boundary, which WCAG 2.2 1.4.11
puts at 3:1.

The fixes keep every hue and change only luminance. `--color-accent-text` is the
accent set as text rather than as a fill: identical to the accent in light mode,
lightened to #7C9BFF in dark. This is the shape `--color-on-accent` already
uses, and it means guide 3.2's "the accent stays" holds literally, since the
accent as a fill is untouched and still carries on-accent at 5.36:1 in both
themes. `--color-field-border` is new and used by inputs, textareas, and the pen
canvas; separators keep the hairline, which is structure and exempt. Dark mode
now sets rule-line, field-border, verify-green, and flag-amber.

One change deviates from the guide's stated palette and is flagged rather than
made quietly. Guide 3.2 gives flag-amber as #B4690E, which reads 4.04:1 on
paper: it fails the AA floor in the light theme, for the small text it is
specified for, and always has. Guide 3.2 introduces its palette as "Tokens
(starting point, to be refined in design review)", while guide 6 states "WCAG
2.2 AA is the floor" without qualification. A floor is not a starting point, so
the floor wins and the value is corrected to #9C5A0B, the same amber at the
luminance AA requires. This is exactly the refinement that sentence reserved,
and it is one value, not a new palette; if the design owner prefers a different
amber, any value clearing 4.5:1 on paper is a drop-in replacement.

The audit now lives in `tokens.test.ts` as tests rather than as this paragraph,
because a one-off audit rots. It was mutation-checked in both directions:
restoring #B4690E fails it. It is complemented by an axe run over the dark theme
in `e2e/accessibility.spec.ts`, which recomputes contrast from real rendered
styles, though its reach is bounded by what the three public surfaces render:
reverting the dark tokens does not fail it, because no unauthenticated page
draws accent link text or amber. The token tests are what cover those pairs, and
the seeded journeys' own axe assertions cover them on the surfaces that do.
