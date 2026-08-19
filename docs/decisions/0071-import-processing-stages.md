# 0071: Honest import processing stages

Date: 2026-08-13. Phase 4.3 (the processing view). Author: backend and frontend
engineers (Claude). The guide already named the copy; this records how the
worker maps onto it.

**The import GET reports `pages_done` and a derived `stage` (`opening`,
`reading`, `segmenting`) so the processing view can name the wait instead of
holding on a single "Reading your PDF" line.** Figure extraction is not a
separate worker stage: it is interleaved with the page loop, so the surface
marks "Reading pages" and "Extracting figures" current together rather than
inventing a sequential figures wait after every page is in. `page_count` is
written as soon as decode returns, before the page loop, so "Reading pages 1
to N" can appear while pages are still landing. Segmentation is the long wait
after every page is recorded. Elapsed time ticks live outside the live region
(so the clock does not re-announce) and the current step uses the motion-safe
progress shimmer from guide 3.3.
