"""The enqueue seam (milestone 3.3). The API only ever hands work to the
worker through this small Protocol, so tests substitute a recording fake and
the API stays green without a broker. When TIRO_REDIS_URL is set, the lifespan
builds an arq-backed queue; otherwise a no-op queue keeps dev and the test
suite running (completing a submission succeeds, processing simply does not
fire).
"""

from typing import Any, Protocol

from fastapi import Request

PROCESS_SUBMISSION = "process_submission"
PROCESS_IMPORT = "process_import"


class TaskQueue(Protocol):
    async def enqueue_process_submission(self, course_id: int, submission_id: int) -> None: ...

    async def enqueue_process_import(self, course_id: int, import_id: int) -> None: ...


class NullTaskQueue:
    """No broker configured: enqueuing does nothing."""

    async def enqueue_process_submission(self, course_id: int, submission_id: int) -> None:
        return None

    async def enqueue_process_import(self, course_id: int, import_id: int) -> None:
        return None


class ArqTaskQueue:
    """Enqueue onto a live arq redis pool."""

    def __init__(self, pool: Any) -> None:
        self._pool = pool

    async def enqueue_process_submission(self, course_id: int, submission_id: int) -> None:
        await self._pool.enqueue_job(PROCESS_SUBMISSION, course_id, submission_id)

    async def enqueue_process_import(self, course_id: int, import_id: int) -> None:
        await self._pool.enqueue_job(PROCESS_IMPORT, course_id, import_id)


def get_task_queue(request: Request) -> TaskQueue:
    """FastAPI dependency; tests override it to record enqueues."""
    queue: TaskQueue = request.app.state.task_queue
    return queue
