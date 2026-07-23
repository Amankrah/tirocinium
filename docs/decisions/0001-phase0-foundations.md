# 0001 — Phase 0 foundations: relocation, toolchain modernization, reference-crate lint policy

Date: 2026-07-23. Phase 0, milestone 0.1. Author: backend engineer (Claude).

Three decisions were needed before the monorepo scaffold could land, none of them
resolved by the guides, so they are recorded here per the working method.

**The repository is standalone.** The project files were sitting inside an unrelated
parent git repository (a different product). Phase 0.1 calls for a monorepo, so the
tree was moved to its own location and `git init`ed fresh on `main`. This keeps
Tirocinium's history isolated and is a prerequisite for every later gate.

**The mastery binding was modernized rather than pinned to the guide's era.** The
guides target Python 3.12 and Rust 1.75 with `pyo3 =0.20.3` and `maturin>=1.4`; the
build host runs Python 3.13, Rust 1.90, and `maturin 0.14` (too old to build the
crate at all), and the bundled `cp312 manylinux` wheel is unusable here (wrong OS
and interpreter). The crate README explicitly permits unpinning "on a newer
toolchain", so `pyo3` was bumped to `0.23` with the stable ABI (`abi3-py310`) and the
build-system requirement to `maturin>=1.7`. The `#[pymodule]` signature was migrated
to the 0.23 `Bound` API; nothing in the arithmetic modules (`engine`, `events`,
`params`, `lib`) changed. abi3 means one wheel serves CPython 3.10+ without a rebuild
per interpreter. Evidence it is safe: the crate's 15 tests and the store's 7 tests are
green after the change. If the project later standardizes on Python 3.12, the abi3
wheel still loads there unchanged.

**Pedantic lints on the moved-in reference crate are accepted as-is.** `clippy
--all-targets -D warnings` is clean, and CI enforces that. `clippy::pedantic` reports
warnings inside the reference crate (single-character math names matching the spec's
notation, `i64`-timestamp-to-`f64` casts in the forgetting curve). Rewriting
property-tested arithmetic to satisfy style lints would trade a real risk for cosmetics
and is forbidden by the "never reimplement its arithmetic" constraint. Policy: pedantic
is enforced on *new* `platform_core` members (the zstd codec, preprocessing, the
numeric comparer) as they land; the reference `mastery` crate is held to its own
property and scenario suites, which are its executable specification.
