"""Progress events for long-running work (milestone 3.3). The transcription
worker publishes per-page progress to a per-submission channel; the SSE
endpoint subscribes and forwards it to the browser. Redis pub/sub is the
transport in dev and production (the worker and the API are separate
processes); an in-memory bus serves single-process tests.

Events are small JSON objects with a "type" ("status", "page", "rejected", or
"done"); "done" is terminal and closes the stream.
"""

import json
import os
from collections.abc import AsyncIterator
from contextlib import AbstractAsyncContextManager, asynccontextmanager
from typing import Any, Protocol

from fastapi import Request

Event = dict[str, Any]

TERMINAL_TYPE = "done"


def channel_for(course_id: int, submission_id: int) -> str:
    return f"submission:{course_id}:{submission_id}"


class EventBus(Protocol):
    async def publish(self, channel: str, event: Event) -> None: ...

    def listen(self, channel: str) -> AbstractAsyncContextManager[AsyncIterator[Event]]: ...


class InMemoryEventBus:
    """A single-process bus: publish fans out to the queues of everyone
    listening on the channel right now (pub/sub, no history)."""

    def __init__(self) -> None:
        self._subscribers: dict[str, set[Any]] = {}

    async def publish(self, channel: str, event: Event) -> None:
        import asyncio

        for queue in list(self._subscribers.get(channel, ())):
            assert isinstance(queue, asyncio.Queue)
            queue.put_nowait(event)

    @asynccontextmanager
    async def listen(self, channel: str) -> AsyncIterator[AsyncIterator[Event]]:
        import asyncio

        queue: asyncio.Queue[Event] = asyncio.Queue()
        self._subscribers.setdefault(channel, set()).add(queue)

        async def events() -> AsyncIterator[Event]:
            while True:
                yield await queue.get()

        try:
            yield events()
        finally:
            self._subscribers[channel].discard(queue)


class RedisEventBus:
    """The cross-process bus backing dev and production: Redis pub/sub."""

    def __init__(self, url: str) -> None:
        self._url = url
        self._client: Any = None

    def _redis(self) -> Any:
        import redis.asyncio as redis

        if self._client is None:
            self._client = redis.from_url(self._url)  # type: ignore[no-untyped-call]
        return self._client

    async def publish(self, channel: str, event: Event) -> None:
        await self._redis().publish(channel, json.dumps(event))

    @asynccontextmanager
    async def listen(self, channel: str) -> AsyncIterator[AsyncIterator[Event]]:
        pubsub = self._redis().pubsub()
        await pubsub.subscribe(channel)

        async def events() -> AsyncIterator[Event]:
            async for message in pubsub.listen():
                if message.get("type") == "message":
                    payload: Event = json.loads(message["data"])
                    yield payload

        try:
            yield events()
        finally:
            await pubsub.unsubscribe(channel)
            await pubsub.aclose()

    async def aclose(self) -> None:
        if self._client is not None:
            await self._client.aclose()


def default_event_bus() -> EventBus:
    """The bus a process uses when the app state has not set one: Redis when
    TIRO_REDIS_URL is configured, otherwise the in-memory bus (dev and tests
    with no broker running)."""
    url = os.environ.get("TIRO_REDIS_URL")
    return RedisEventBus(url) if url else InMemoryEventBus()


def get_event_bus(request: Request) -> EventBus:
    """FastAPI dependency; tests override it to share a bus with a publisher."""
    bus: EventBus = request.app.state.event_bus
    return bus
