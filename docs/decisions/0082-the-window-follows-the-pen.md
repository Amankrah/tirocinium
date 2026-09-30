# 0082: the window follows the pen

Decision 0080 put the handwriting sheet in its own scrolling window, because
the page is taller than the space available to show it. That was right, and it
left one thing undone: the window did not move while you wrote in it. A student
writing down the sheet reached the bottom edge of the window, ran out of
visible paper, and had to lift the pen, find the scrollbar, drag, and pick the
sentence back up. Nobody writes that way on paper, and the pad exists to feel
like paper.

So the window follows the pen. While a stroke is in progress, if the pen comes
within a margin of the bottom edge the window scrolls down to keep it clear of
that edge, and the same upward. The rule lives in `lib/upload/pen-scroll.ts` as
a pure function of where the pen is inside the window and how far the window
can scroll, so it can be reasoned about and tested without a canvas, which is
the upload controller's pattern applied to a smaller thing.

Four details in it are deliberate.

It only follows while drawing. A student who scrolls back to re-read what they
wrote a minute ago is not dragged forward again, because nothing is happening
under the pen.

It clamps to what the window can actually scroll, which is what makes the
bottom of the sheet behave like the bottom of a page: the pen keeps going and
the paper does not. There is no growing page here. The sheet is a fixed
1000 by 1414 because that is what it exports as a PNG, the page list counts
pages, and the upload limits are per page; a sheet that grew while you wrote
would quietly break all three. "Add this page" is how you get more paper.

It returns the current scroll position unchanged when the pen is comfortably
inside, so the caller compares before assigning and the common case touches no
DOM at all. A pointer move fires often enough that this matters.

And a window shorter than two margins has no comfortable middle, so the rule
degenerates to centring on the pen rather than oscillating between the two
edges. That case is reachable: the window is now capped against the viewport
as well as in rem, so a short screen gets a usable window rather than one
taller than the screen it sits on.

The hint copy changed with the behaviour, because it described the old one.
It used to say "Scroll this page to reach the rest of it", which was an
instruction to do something the product now does.
