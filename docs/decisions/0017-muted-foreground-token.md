# 0017 — A pinned muted-foreground token, not an alpha of ink

Date: 2026-07-23. Phase 2, closing the 2.2 to 2.4 gate. Author: frontend engineer (Claude).

**De-emphasised text uses a solid `--color-ink-muted` token, contrast-tested in
both themes, replacing the ad-hoc `text-ink/60` and `text-ink/50` opacity
utilities.** The frontend guide is silent on a secondary-foreground colour: its
section 3.2 palette names ink, paper, accent, the rule line, and the two state
colours, and section 6 only requires that WCAG 2.2 AA contrast be verified in
both themes with axe in CI. In the absence of a token, de-emphasised text (the
seat number in the shell, back links, timestamps, empty-state notes, draft
status) had been written as an alpha of ink, mostly `text-ink/60`. That value
computes to 4.51:1 on paper, sitting exactly on the AA boundary for normal-size
text (the muted text renders at `text-sm` and `text-xs`, so the 4.5:1 normal
threshold applies, not the 3:1 large-text one), and axe's exact luminance maths
lands it just under, which is what turned the Lighthouse accessibility gate red
on the landing. `text-ink/50` was worse, well below AA. Rather than nudge one
opacity, the muted foreground becomes a first-class token: `--color-ink-muted`
is `#5B5E64` in light (6.22:1 on paper) and `#9A99A3` in dark (6.54:1 on the
ground), both clearing AA with margin while staying visibly quieter than full
ink (16.65:1 and 14.74:1). It is pinned in `tokens.test.ts` by both its value
and a computed-contrast assertion, so the boundary can never be re-approached
silently, and every de-emphasised text usage now reads `text-ink-muted`. The
remaining `text-ink/70` usages (chip tags, some empty states) already clear AA
at 6.29:1 and are left as they are; `text-ink-muted` is the canonical choice for
new muted text. Placeholder text (`text-ink/30`) and disabled controls
(`opacity-50`) are exempt from the contrast requirement and unchanged.
