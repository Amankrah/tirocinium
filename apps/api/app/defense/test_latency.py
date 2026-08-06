"""The Phase 7 latency gate: p95 first audio under 800 ms from the end of the
student's speech, against recorded speech fixtures with mocked provider
latencies at realistic distributions.

Time here is virtual, not slept: the engine takes its clock as a parameter, so
the fakes advance a virtual clock by the latency they are simulating and the
engine's own instrumentation reports exactly the simulated turn. That makes the
harness deterministic (seeded distributions, no wall-clock flakiness) and fast,
and it measures the one thing a harness can measure without providers: that the
loop adds no latency of its own on top of what the providers cost.

The budget is assembled from the four costs a turn actually pays, per decision
0044: the recognizer's end-of-turn detection, the tutor's first token against a
cached prompt prefix, the synthesizer's time to first audio, and one network
round trip. The engine's metric covers the middle two (it starts timing when
the committed student turn arrives); the harness adds the recognizer and the
network around it to get first-audio-from-end-of-speech.
"""

import asyncio
import random
import statistics
from collections.abc import AsyncIterator, Sequence

from app.defense.engine import DefenseEngine, Inbound, Outbound
from app.defense.model import TokenUsage, Turn

TURNS = 200
BUDGET_MS = 800

# Recorded speech fixtures: what a student says in a defence, in the register
# the tutor is answering (short spoken sentences, not written prose).
STUDENT_UTTERANCES = [
    "I used Ohm's law because the supply is fixed and the resistance is given.",
    "Because the current has to be the same everywhere in a series loop.",
    "I divided twelve by four thousand seven hundred.",
    "It would halve, since current is inversely proportional to resistance.",
    "I am not sure why that step follows, actually.",
]

TUTOR_REPLIES = [
    "Good. Why does the same current flow through both resistors?",
    "Say more about what fixes the current in that loop.",
    "That is right. What would change if the resistance doubled?",
    "Can you say why inversely, rather than just that it is?",
    "Then let us look at the figure again together.",
]


class VirtualClock:
    """A clock the fakes move, so simulated provider latency is exact."""

    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now

    def advance(self, milliseconds: float) -> None:
        self.now += milliseconds / 1000.0


class LatentTutor:
    """A tutor whose first token costs the sampled first-token latency."""

    def __init__(self, clock: VirtualClock, latencies: list[float]) -> None:
        self._clock = clock
        self._latencies = list(latencies)
        self._calls = 0

    def usage(self) -> TokenUsage:
        return TokenUsage()

    async def stream_reply(
        self,
        system: str,
        turns: list[Turn],
        *,
        figures: list[bytes],
        model_id: str,
    ) -> AsyncIterator[str]:
        index = self._calls
        self._calls += 1
        reply = TUTOR_REPLIES[index % len(TUTOR_REPLIES)]
        self._clock.advance(self._latencies[index])
        for start in range(0, len(reply), 20):
            yield reply[start : start + 20]

    async def close_rubric(
        self,
        system: str,
        turns: list[Turn],
        rubric_prompt: str,
        *,
        figures: list[bytes],
        model_id: str,
    ) -> str:
        raise AssertionError("the latency harness never closes a session")


class LatentTts:
    """A synthesizer whose first chunk costs the sampled time to first audio."""

    def __init__(self, clock: VirtualClock, latencies: list[float]) -> None:
        self._clock = clock
        self._latencies = list(latencies)
        self._calls = 0

    @property
    def provider(self) -> str:
        return "latent-tts"

    async def stream(
        self, text_chunks: AsyncIterator[str], *, voice: str | None = None
    ) -> AsyncIterator[bytes]:
        index = self._calls
        self._calls += 1
        first = True
        async for chunk in text_chunks:
            if first:
                self._clock.advance(self._latencies[index])
                first = False
            yield b"pcm:" + chunk.encode("utf-8")


def sample(
    rng: random.Random, mean: float, sigma: float, floor: float, count: int
) -> list[float]:
    return [max(floor, rng.gauss(mean, sigma)) for _ in range(count)]


class Collector:
    def __init__(self) -> None:
        self.first_audio: list[int] = []
        self._done = asyncio.Event()

    async def emit(self, event: Outbound) -> None:
        if event.kind == "reply_done" and event.first_audio_ms is not None:
            self.first_audio.append(event.first_audio_ms)
            self._done.set()

    async def wait(self, count: int, timeout: float = 10.0) -> None:
        async def wait() -> None:
            while len(self.first_audio) < count:
                self._done.clear()
                await self._done.wait()

        await asyncio.wait_for(wait(), timeout)


async def measure_turns() -> tuple[list[int], list[float]]:
    """Drive `TURNS` student turns and return the engine's per-turn first-audio
    figures beside the end-to-end ones (the engine's, plus the recognizer's
    end-of-turn detection and one network round trip)."""
    rng = random.Random(20260725)
    clock = VirtualClock()
    # Deepgram Flux end-of-turn detection, Claude first token on a cached
    # prefix, Cartesia Sonic time to first audio, and an in-region round trip.
    endpoint_ms = sample(rng, 180, 50, 80, TURNS)
    first_token_ms = sample(rng, 200, 60, 90, TURNS)
    ttfa_ms = sample(rng, 195, 45, 120, TURNS)
    network_ms = sample(rng, 50, 18, 20, TURNS)

    tutor = LatentTutor(clock, first_token_ms)
    tts = LatentTts(clock, ttfa_ms)
    collector = Collector()
    inbox: asyncio.Queue[Inbound | None] = asyncio.Queue()

    async def inbound() -> AsyncIterator[Inbound]:
        while True:
            message = await inbox.get()
            if message is None:
                return
            yield message

    engine = DefenseEngine(
        tutor=tutor,
        system="system",
        tutor_model="m",
        tts=tts,
        max_student_turns=TURNS,
        wind_down_before=1,
        clock=clock,
    )
    runner = asyncio.create_task(engine.run(inbound(), collector.emit))
    for index in range(TURNS):
        inbox.put_nowait(
            Inbound(
                kind="text",
                text=STUDENT_UTTERANCES[index % len(STUDENT_UTTERANCES)],
            )
        )
        await collector.wait(index + 1)
    await runner

    end_to_end = [
        engine_ms + endpoint_ms[index] + network_ms[index]
        for index, engine_ms in enumerate(collector.first_audio)
    ]
    return collector.first_audio, end_to_end


def percentile(values: Sequence[float], fraction: float) -> float:
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, int(fraction * len(ordered)))]


async def test_p95_first_audio_is_inside_the_budget() -> None:
    """The gate: p95 first audio under 800 ms from end of student speech."""
    engine_ms, end_to_end = await measure_turns()

    assert len(end_to_end) == TURNS
    p95 = percentile(end_to_end, 0.95)
    median = statistics.median(end_to_end)
    assert p95 < BUDGET_MS, (
        f"p95 first audio {p95:.0f} ms over the {BUDGET_MS} ms budget"
        f" (median {median:.0f} ms)"
        f" (engine-only p95 {percentile(engine_ms, 0.95):.0f} ms)"
    )


async def test_the_loop_adds_no_latency_of_its_own() -> None:
    """The regression signal that survives a provider change: the engine's own
    measured turn is the provider latencies and nothing else, so a future edit
    that serialises what should overlap shows up here rather than in
    production."""
    rng = random.Random(20260725)
    endpoint_ms = sample(rng, 180, 50, 80, TURNS)
    first_token_ms = sample(rng, 200, 60, 90, TURNS)
    ttfa_ms = sample(rng, 195, 45, 120, TURNS)

    engine_ms, _ = await measure_turns()

    for index, measured in enumerate(engine_ms):
        expected = first_token_ms[index] + ttfa_ms[index]
        assert abs(measured - expected) <= 1, (
            f"turn {index} measured {measured} ms against {expected:.0f} ms"
            " of simulated provider latency"
        )
    # And the recognizer's detection is real cost the harness accounts for, not
    # something the engine can hide.
    assert min(endpoint_ms) >= 80
