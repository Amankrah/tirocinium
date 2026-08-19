"""Derived import progress (frontend guide 4.3). The GET reports a stage the
surface can name honestly: page_count is known after decode, pages_done is
the count of recorded import_pages, and segmentation is the wait after every
page is in. Figure extraction is interleaved with the page loop, so it is
not a separate server stage.
"""

from typing import Literal

ImportStage = Literal["opening", "reading", "segmenting"]


def import_stage(
    status: str, page_count: int | None, pages_done: int
) -> ImportStage | None:
    """The live stage of a processing job, or None when the job is not in
    the worker (pending, uploaded, ready, failed, confirmed)."""
    if status != "processing":
        return None
    if page_count is None:
        return "opening"
    if pages_done < page_count:
        return "reading"
    return "segmenting"
