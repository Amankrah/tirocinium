"""The derived import stage: a pure function of status, page_count, and
pages_done, so the GET can name the wait without a new column."""

from app.imports.progress import import_stage


def test_not_processing_has_no_stage() -> None:
    for status in ("pending", "uploaded", "ready", "failed", "confirmed"):
        assert import_stage(status, 9, 9) is None


def test_processing_before_decode_is_opening() -> None:
    assert import_stage("processing", None, 0) == "opening"


def test_processing_with_pages_still_to_record_is_reading() -> None:
    assert import_stage("processing", 9, 0) == "reading"
    assert import_stage("processing", 9, 3) == "reading"
    assert import_stage("processing", 9, 8) == "reading"


def test_processing_with_every_page_recorded_is_segmenting() -> None:
    assert import_stage("processing", 9, 9) == "segmenting"
    assert import_stage("processing", 1, 1) == "segmenting"
