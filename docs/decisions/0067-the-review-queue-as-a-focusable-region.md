# 0067 — a keyboard queue has to be reachable by keyboard

Date: 2026-08-12. Phase 9.6 (a defect against guide 6). Author: frontend
engineer (Claude).

All three of the product's j/k queues (the flagged-variant review, the
submission review, and the import confirmation) put their `onKeyDown` on a
wrapper `<div tabIndex={-1}>`, which means the keyboard model exists but the
route into it does not: a professor arriving by keyboard has to Tab into some
control inside the queue before j and k do anything, and a tabindex of -1 says
in as many words that the region is reachable only programmatically. Journey six
found it by pressing the `<ol>`, which has no tabindex, so the event never
reached the handler's subtree and nothing opened; the Vitest tests did not,
because firing a synthetic keydown at the wrapper proves the handler and says
nothing about whether a person can get there. The fix follows the shape of each
surface rather than being applied uniformly. On the flagged queue everything
focusable lives inside the `<ol>`, so the handler and `tabIndex={0}` move onto
the `<ol>` itself, which makes the list the keyboard widget it always was,
leaves the journey pressing something a user can genuinely reach, and costs
nothing on the way in. On the submission queue and the confirmation surface the
status filters sit outside the list and must keep working under j and k, so the
handler stays on the wrapper and only its tabindex changes to 0. In all three
the focus stop is given a name and a description (`role="group"` where it is a
wrapper, `aria-label` naming the queue, `aria-describedby` pointing at the line
that already lists the keys) and a visible focus ring from the token layer,
since guide 6 asks for focus states designed as part of the visual language and
a tab stop that announces nothing is its own defect. The lesson worth keeping is
the testing one: a keyboard assertion that dispatches the event itself has
assumed away the only part that was broken, so the queues now also assert that
the element the keys are bound to can hold focus.
