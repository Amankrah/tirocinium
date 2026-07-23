# 0002 — Phase 0.2: how dependencies are pinned, and the Python version

Date: 2026-07-23. Phase 0, milestone 0.2. Author: backend engineer (Claude).

**Exact pins live in lock files, not in pyproject ranges.** The phases document
asks for a "pinned and scripted" toolchain but does not say how to pin. Inventing
exact version numbers by hand risks pinning to versions that do not exist or that
conflict; instead `apps/api/pyproject.toml` declares compatibility bounds and the
committed `uv.lock` is the exact, hash-verified pin, the same division of labor
`Cargo.lock` already performs for the Rust workspace. `infra/setup.sh` installs
with `uv sync` and CI uses `uv sync --locked`, so every environment resolves to
byte-identical versions until the lock is deliberately regenerated.

**Python is 3.12, provisioned by uv, everywhere.** Decision 0001 built on the
host's Python 3.13 because that was what the machine had; uv removes that
constraint by downloading a pinned CPython on any host. The backend guide names
Python 3.12, so `apps/api/.python-version` pins 3.12, setup.sh and CI both honor
it, and the store suite runs green on 3.12.13 against the same abi3 wheel. This
supersedes 0001's 3.13 stance; the abi3-py310 binding makes the change free.

**maturin comes from its PyPI wheel, not `cargo install`.** The phases document
says `cargo install maturin`; that compiles maturin from source on every fresh
machine (minutes) to produce the same binary PyPI ships as a wheel (seconds).
maturin is pinned in the dev dependency group (`>=1.7,<2.0`, exact version in
uv.lock), which is a stronger pin than an unversioned cargo install, so the
intent of the guide (a pinned, scripted maturin) is met with a faster mechanism.
`cargo-criterion` has no such wheel and is installed with cargo as written.
