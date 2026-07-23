# 0006 — Phase 1.2: the codec's boundary, and one wheel for platform_core

Date: 2026-07-23. Phase 1, milestone 1.2. Author: backend engineer (Claude).

**The Python boundary consolidated into a single `platform_core` wheel.** The
backend guide says "ship the Rust code as a single crate built with maturin"
(section 2), but Phase 0 inherited a standalone `tirocinium_mastery` wheel.
With a second member landing, the umbrella crate
`crates/platform_core/python` now assembles each member's feature-gated
bindings into one `platform_core` module with `mastery` and `codec`
submodules (registered in `sys.modules`, so both import forms work), and the
standalone wheel is gone. Members expose a `register` function; the mastery
crate's arithmetic is untouched, only its binding gained that entry point.
Future members (preprocessing 3.2, the numeric comparer 5.3) join the same
umbrella.

**The codec takes dictionary bytes, not a dict_id.** Guide 3.3's sketch
`compress(blob, dict_id)` implies a process-global dictionary registry inside
the extension. I hold that a registry is the wrong shape here: dictionaries
are per course shard, so ids are only meaningful relative to a shard, and
global mutable state in the extension would break the purity that makes
`platform_core` property-testable. The Rust functions are pure
(`compress(data, dictionary_bytes, level)`), and `app/compression.py`
resolves content type to dictionary from the shard, which is the layer that
owns shard state. The guide's intent, "Python never touches raw zstd", holds:
Python shuttles opaque bytes and never performs codec work.

**Compatibility across training.** Blobs written before a course's dictionary
exists are plain zstd frames; zstd frames self-describe their dictionary, so
they stay readable after training (tested), and a wrong dictionary fails
loudly rather than yielding garbage (property-tested). One active dictionary
per content type per shard; retraining replaces it deliberately.
