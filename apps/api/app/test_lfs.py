"""The LFS pointer detector that guards the fixture-backed pdfium tests.

Small, but it decides whether a suite reports "the data is not here" or an
opaque decode failure, so it is pinned rather than trusted.
"""

from pathlib import Path

from app.lfs import any_unfetched, is_pointer

POINTER = (
    b"version https://git-lfs.github.com/spec/v1\n"
    b"oid sha256:c6485cad92deb0864ced49946d703a011b503105c5b4b60bc8edf5f1227b6e49\n"
    b"size 132\n"
)


def test_a_pointer_file_is_recognised(tmp_path: Path) -> None:
    pointer = tmp_path / "question.pdf"
    pointer.write_bytes(POINTER)

    assert is_pointer(pointer)


def test_a_real_pdf_is_not_a_pointer(tmp_path: Path) -> None:
    real = tmp_path / "question.pdf"
    real.write_bytes(b"%PDF-1.7\n%\xe2\xe3\xcf\xd3\n")

    assert not is_pointer(real)


def test_an_empty_file_is_not_a_pointer(tmp_path: Path) -> None:
    empty = tmp_path / "question.pdf"
    empty.write_bytes(b"")

    assert not is_pointer(empty)


def test_a_missing_file_is_not_a_pointer(tmp_path: Path) -> None:
    """Absent is a different failure from unfetched, and reports as itself."""
    assert not is_pointer(tmp_path / "nothing-here.pdf")


def test_any_unfetched_spots_one_pointer_among_real_files(tmp_path: Path) -> None:
    real = tmp_path / "real.pdf"
    real.write_bytes(b"%PDF-1.7\n")
    pointer = tmp_path / "pointer.pdf"
    pointer.write_bytes(POINTER)

    assert not any_unfetched(real)
    assert any_unfetched(real, pointer)
