# 0024 — The pdfium decode member, completing 4.1

Date: 2026-07-23. Phase 4, milestone 4.1 (the backend half deferred by decision
0021). Author: backend engineer (Claude).

**The real PDF decoder is a new `platform_core` member, `tirocinium-pdf`, built
on `pdfium-render` over a pinned pdfium native binary that infra provisions and
the crate loads at runtime; it classifies each page, extracts born-digital text,
and renders every page to a PNG, and it wires `PdfiumDecoder` so the 4.1 seam is
now live.** Decision 0021 built the decode scaffolding against a `PdfDecoder`
seam and deferred the native work; this closes it. `pdfium-render` (0.9, features
`image_025` for PNG encoding and `thread_safe`) binds a prebuilt pdfium binary
(bblanchon/pdfium-binaries, pinned to `chromium/7961`) rather than building
pdfium from source. The binary is not committed: `infra/setup.sh` downloads the
platform archive into `crates/platform_core/pdf/vendor/` (Windows `bin/pdfium.dll`,
Linux and macOS `lib/libpdfium.{so,dylib}`), and both the Rust tests and the
Python resolver find it there or honour a `TIRO_PDFIUM_LIB` override. The
feasibility of this on the Windows dev host was proven with a spike before the
member was built out, since the native load path was the real risk (the reason
0021 split it out).

pdfium initializes and tears down global process state on bind and drop, and
re-initializing after a teardown aborts the process, which surfaced immediately
as the two decode tests crashed when the harness ran them in parallel. So pdfium
is bound exactly once per process into a `OnceLock`, never dropped, with a mutex
serializing that one-time init; the `thread_safe` feature then guards concurrent
use of the shared instance. `decode(lib_path, pdf, render_width)` returns one
record per page: the index, the kind, the born-digital text (or `None`), and a
PNG raster of the page. Classification probes the text layer, treating a page
with fewer than eight alphanumeric characters as having none and routing it to
the scanned path (render then the vision seam); a vector-only page with no text
therefore reads as scanned, which is the right outcome (there is nothing to
extract). The PyO3 surface is `platform_core.pdf.decode`, and
`app/imports/decoder.py`'s `PdfiumDecoder` calls it, resolving the library path
and mapping the tuples onto `DecodedPage`.

Two conventions are bent, on purpose. First, decode is exercised in tests with
real pdfium calls, not recorded responses: pdfium is deterministic CPU work, not
a model, exactly like the preprocess member's real image processing, so the
recorded-response rule (which is about model calls) does not apply. The Rust
decode tests and the Python decoder tests skip when the binary is absent, so a
bare checkout stays green while the assertions run wherever infra has provisioned
it. Second, the member ships without a criterion bench, unlike every member since
the codec: decode time is dominated by native pdfium rendering rather than our
code, and a bench would need the vendored binary present on every host that runs
`cargo bench`, so the member is exempt from the bench-budget gate the way the
mastery crate is exempt from pedantic. Milestone 4.1 is now complete end to end;
figure extraction (4.2) builds on the pdfium object tree this member opens, and
the five-PDF golden corpus remains the external asset the Phase 4 gate awaits.
