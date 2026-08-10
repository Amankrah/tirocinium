# 0046: the Phase 4 PDF gates get their preconditions, in CI and in the skip

Verifying the Phase 7 baseline turned up ten failures that were not a
regression: the pdfium decode, figure-extraction, and mode-B round-trip tests
were handing pdfium a Git LFS pointer file, because the fixture PDFs are
LFS-tracked project assets and `git lfs pull` had not run on the host. Chasing
that down exposed the larger problem. Those tests skip when the pdfium binary
is absent, which is correct, but CI checked out without `lfs: true` and never
provisioned pdfium in the `rust` or `api` jobs, so the skip always fired and the
Phase 4 gates had never actually asserted anything anywhere. A gate that cannot
fail is not a gate, so both halves are fixed here. In the code, an unfetched LFS
pointer is now recognised as what it is, the data not being present, and skips
with that reason (`platform_core::pdf::testkit` for Rust, `app/lfs.py` for
Python) instead of surfacing as an opaque `FormatError` that reads like a decode
bug; the pdfium check and the fixture check sit side by side because they are
the same condition. In CI, the three jobs that carry those gates now check out
with `lfs: true` and run `infra/provision-pdfium.sh`, a new script holding the
version pin that `infra/setup.sh` previously owned inline and now calls, so the
pin stays in one place. Skipping on a bare checkout remains the right behaviour,
and it is honest only because CI now provisions both preconditions; `setup.sh`
also pulls LFS when git-lfs is installed and warns plainly when it is not.
