# The manual screen-reader passes

Milestone 9.3 asks for VoiceOver and NVDA passes on the key surfaces, and guide
6 makes a manual screen-reader pass part of the definition of done for each of
the four key ones. This is the checklist for that work and the place its results
are recorded. It is deliberately a human document: axe covers what a machine can
see (roles, names, contrast, landmarks) and finds none of what these passes are
for, which is whether the surface makes sense when it is heard rather than seen.

Nothing here is done yet. The automatable half of 9.3 is:
`e2e/accessibility.spec.ts` (dark-theme axe, reduced motion asserted on the
rendered page, keyboard operability) and `src/styles/tokens.test.ts` (the
contrast audit of decision 0062, both themes, mutation-checked). Every journey
carries its own axe assertion. The passes below are what remain, and they need a
person at a real machine with a real screen reader; they cannot be simulated,
and a run in a browser extension is not one of them.

## What to run, and where

Two readers, because they disagree in ways that matter: **VoiceOver** with
Safari on macOS, and **NVDA** with Firefox on Windows. Use each with its own
default settings and, at least once, with the screen off or eyes closed, since
the point is whether the surface is usable without the visual layout carrying
the meaning.

## The surfaces, and what each pass must establish

**The seat entry (`/enter`).** The one field is announced with its purpose, not
just its name; the Crockford formatting the field applies as you type does not
make the reader re-announce the whole value on every keystroke; and the failure
line is announced when it appears without stealing focus. This is a student's
first contact with the product, and it is one field, so there is no excuse for
it to be anything but perfect.

**Course home (`/course`).** The seat number in the shell is reachable and reads
as identity rather than as a stray number. The mastery labels are the load-
bearing part: every label is a disclosure, and the pass must establish that
opening one announces its evidence trail, that the trail's dates and sources are
intelligible read aloud, and that a label is never encountered without a way to
open it. That rule is product law (mastery spec 9), and a screen-reader user
meeting a bare label would be the one way it could still be broken.

**The problem view (`/course/{id}`).** The reading column, the maths, and the
figures. KaTeX output is the risk: check that an equation is announced as
something rather than as a stream of glyph names, and that a `fig://` figure's
alternative text says what the figure is for rather than "image". A figure with
no useful alternative text is the accessible equivalent of a missing figure, and
figures are the one thing this product promises never to lose.

**The upload flow (`/course/{id}/upload`).** The most engineered surface and the
one most likely to fail here. The three-mode picker must announce which mode is
current. Adding pages, reordering them, and removing them must each announce
what happened. The processing state is a live region, so the pass must establish
that per-page progress is announced without flooding, that the terminal outcome
is announced, and that a rejected page's retake instruction is heard. Run this
one on a phone with VoiceOver as well, because that is the real path.

**The defence (`/course/{id}/defence/{id}`).** A spoken interface used by
someone who may already be listening to a screen reader is the hardest case in
the product. Establish that the reader and the tutor's audio do not fight, that
the turn transcript is announced as it grows without repeating the whole
conversation, that `speech_down` and `audio_down` are heard when they arrive,
and that the typed path is reachable at any moment by keyboard alone. If the two
audio streams do prove to collide, that is a finding worth a decision record,
not a workaround.

**The professor surfaces**: sign-in, the review queue, the submission detail,
and the flagged queue. The queues are j/k driven, so establish that the current
row is announced when it changes (`aria-current` is set; whether it is *heard*
is the question) and that the keyboard model does not trap or fight the reader's
own navigation keys, which is the usual failure of a j/k interface. On the
submission detail, establish that the region hover-linking has a keyboard and
reader equivalent: the reading lines are focusable buttons for exactly this
reason, and the pass decides whether that is enough.

## One measurement that belongs with these

The particle hero's 3 ms GPU frame-time budget (guide 3.3, rule 3, on a 2019
mid-range laptop) is the same kind of claim as the passes above: it needs real
hardware, and a figure produced by a headless software rasterizer would be about
the rasterizer. Measure it on the landing page and on course home with the
browser's own frame profiler, on a machine of about that vintage, and record it
here beside the reader passes. Decision 0063 states what is verified in its
place: one draw call per frame, a capped particle count, and 4 to 26 ms of total
blocking time with the field live against a 200 ms budget.

## Recording a pass

For each surface and each reader, record the date, the reader and browser
versions, and one of: passed, or a numbered list of findings. A finding gets
fixed and the surface re-run, or it gets a decision record saying why it stands.
Sign-off for 9.3 means every surface above has a passed entry from both readers,
and the release gate (phase 9) wants that recorded here.

### Results

None yet.
