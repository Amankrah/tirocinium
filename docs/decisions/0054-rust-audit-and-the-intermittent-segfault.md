# 0054: the Rust audit, the pyo3 advisories, and an intermittent segfault

The Rust half of milestone 9.2's dependency audit is now wired: a `rust-audit`
job runs `cargo audit` on every push, so a new advisory fails the build. Two
advisories are open and listed explicitly by id rather than suppressed
wholesale, which keeps accepting them a visible decision and keeps anything
new loud: RUSTSEC-2025-0020 (buffer overflow in `PyString::from_object`) and
RUSTSEC-2026-0177 (missing `Sync` bound on `PyCFunction::new_closure`), both
against pyo3 0.23.5 and both fixed by upgrading. Two further findings are
unmaintained-crate warnings on transitive dependencies of the image stack
(`paste`, `ttf-parser`) and are not vulnerabilities.

The upgrade was attempted and rejected on evidence. pyo3 0.29 builds cleanly
once `Python::allow_threads` is renamed to `Python::detach` (the GIL is still
released inside every long native call, as the guide requires), and the whole
Rust suite, clippy, and rustfmt pass on it. What stopped it was the Python
suite: it segfaults intermittently, and the upgrade made that markedly worse.
Measured over full-suite runs on this machine, pyo3 0.23 crashed 5 times in 50
runs and pyo3 0.29 crashed 5 times in 12. Landing a fourfold increase in a
crash rate to close two advisories that require a specific unsafe call pattern
we do not use is the wrong trade, so the pin stays at 0.23 and the advisories
are carried with their reason recorded.

That leaves the segfault itself, which matters more than the advisories and is
recorded here because it is a real defect rather than a nuisance. The Python
suite crashes on roughly one full run in ten. It is not caused by, and not
fixed by, either the pyo3 version or the pytest version: it reproduces on
pyo3 0.23 and 0.29 and on pytest 8 and 9. The faulthandler output is consistent
in shape: the faulting thread is always mid garbage collection, on an anyio
worker thread inside Starlette request handling, with pydantic schema
generation on the stack in one capture and the error middleware in another. It
does not reproduce when the newer suites are run alone, only across the full
suite, which points at accumulated state across many built applications and
`TestClient` instances rather than at any single test. The next step is a
native backtrace: this host routes cores through apport, so reproducing with
`core_pattern` set to a plain file and reading the frame under
`collect_with_callback` would say which extension module's traverse or clear is
at fault. Until then the honest statement is that the suite is flaky at about
ten per cent per full run, that this predates milestone 9.2, and that no gate
result in this project should be believed from a single green run.

One correction belongs in the record. Earlier in Phase 8 this same crash was
reported as a SIGPIPE artefact of piping pytest to `tail`, on the evidence that
it appeared only in piped invocations across a handful of runs. That
explanation was wrong. The runs that produced it were too few to distinguish a
ten per cent failure rate from a correlation with the pipe, and full-output
runs crash too.
