"""Git LFS pointer detection for fixture-backed tests.

The golden corpora and the committed fixture PDFs are project assets in Git
LFS, so on a checkout where `git lfs pull` has not run they are short text
pointer files rather than the real bytes. A test that hands one of those to
pdfium gets an opaque `FormatError`, which reads like a decode regression and
is not one: the data is simply not there.

That is the same condition as the pdfium binary being unprovisioned, and it
gets the same treatment, a skip that names the reason. Skipping is honest only
because CI fetches LFS and provisions pdfium, so these assertions do run
somewhere; on a bare checkout the suite stays green without pretending absent
data was verified.
"""

from pathlib import Path

# Every Git LFS pointer file begins with this line (the v1 pointer spec).
_POINTER_PREFIX = b"version https://git-lfs.github.com/spec/v1"

SKIP_REASON = "fixture is an unfetched Git LFS pointer (run `git lfs install && git lfs pull`)"


def is_pointer(path: Path) -> bool:
    """Whether the file is an unfetched LFS pointer rather than the real asset.

    A missing file is not a pointer: that is a different failure and should be
    reported as itself.
    """
    try:
        with path.open("rb") as handle:
            return handle.read(len(_POINTER_PREFIX)) == _POINTER_PREFIX
    except OSError:
        return False


def any_unfetched(*paths: Path) -> bool:
    """Whether any of these fixtures is still an LFS pointer."""
    return any(is_pointer(path) for path in paths)
