"""The speech provider adapters (decision 0044): Deepgram Flux for streaming
recognition and Cartesia Sonic for streaming synthesis, each a small class
behind the Protocols in app.defense.speech, chosen by environment so a
deployment swaps providers without touching the engine.

With nothing configured, sessions run typed-only with caption replies, which
is the graceful-degradation floor of guide 6.5 and what the test suite runs
against (its scripted fakes implement the same Protocols). Neither adapter is
exercised by the suite: they are live-provider integrations, and the standing
rule is that tests use recorded responses, so their smoke test belongs in the
non-blocking lane. What the suite does pin is the wire translation each
adapter performs, which is why the message mapping lives in module-level pure
functions rather than inside the socket loops.

Recognition defaults to Deepgram's EU endpoint, which is a hostname we can
choose here. Synthesis has no EU hostname to choose: Cartesia serves one global
URL and in-region processing is a property of the account's regional
deployment, so `TIRO_CARTESIA_URL` exists to point at whatever endpoint that
contract yields, and the residency guarantee for synthesis is a procurement
action rather than a line of code (decision 0044).
"""

import asyncio
import base64
import contextlib
import json
import os
import uuid
from collections.abc import AsyncIterator

import websockets

from app.defense.speech import SpeechSession, SpeechToText, SttEvent, TextToSpeech

# ---------------------------------------------------------------- Deepgram

DEEPGRAM_URL = os.environ.get("TIRO_DEEPGRAM_URL", "wss://api.eu.deepgram.com/v2/listen")
DEEPGRAM_MODEL = os.environ.get("TIRO_DEEPGRAM_MODEL", "flux-general-en")
# The browser sends mono 16 kHz 16-bit PCM; Flux wants that declared.
STT_ENCODING = "linear16"
STT_SAMPLE_RATE = 16_000
# Confidence to end a turn, and the lower confidence at which we start a reply
# speculatively (retracted by TurnResumed if the student was only pausing).
EOT_THRESHOLD = os.environ.get("TIRO_STT_EOT_THRESHOLD", "0.7")
EAGER_EOT_THRESHOLD = os.environ.get("TIRO_STT_EAGER_EOT_THRESHOLD", "0.5")


def flux_events(message: str) -> list[SttEvent]:
    """Translate one Flux server message into seam events.

    Flux reports turn state rather than raw partials: `Update` is speech in
    progress, `EagerEndOfTurn` is a probable ending we may answer early,
    `TurnResumed` retracts it, and `EndOfTurn` is the ending we commit to. The
    seam has two flags, so the mapping is: interim text is a partial (which the
    engine treats as barge-in), an eager ending is a final without an endpoint
    (the engine may draft), a resumption is a bare partial that cancels the
    draft, and only `EndOfTurn` carries `endpoint`, which closes the turn.
    """
    try:
        payload = json.loads(message)
    except ValueError:
        return []
    if payload.get("type") != "TurnInfo":
        return []
    event = str(payload.get("event", ""))
    transcript = str(payload.get("transcript", ""))
    if event == "EndOfTurn":
        return [SttEvent(text=transcript, final=True, endpoint=True)]
    if event == "EagerEndOfTurn":
        return [SttEvent(text=transcript, final=True)]
    if event in ("Update", "StartOfTurn", "TurnResumed"):
        return [SttEvent(text=transcript)] if transcript else []
    return []


class DeepgramFluxSession:
    """One live Flux recognition stream."""

    def __init__(self, socket: websockets.ClientConnection) -> None:
        self._socket = socket

    async def push_audio(self, chunk: bytes) -> None:
        await self._socket.send(chunk)

    async def events(self) -> AsyncIterator[SttEvent]:
        async for message in self._socket:
            if isinstance(message, bytes):
                continue
            for event in flux_events(message):
                yield event

    async def finish(self) -> None:
        await self._socket.send(json.dumps({"type": "CloseStream"}))


class DeepgramFluxStt:
    def __init__(self, api_key: str | None = None) -> None:
        self._api_key = api_key or os.environ.get("TIRO_DEEPGRAM_API_KEY")

    @property
    def provider(self) -> str:
        return "deepgram-flux"

    async def connect(self, *, language: str = "en") -> SpeechSession:
        query = {
            "model": DEEPGRAM_MODEL,
            "encoding": STT_ENCODING,
            "sample_rate": str(STT_SAMPLE_RATE),
            "eot_threshold": EOT_THRESHOLD,
            "eager_eot_threshold": EAGER_EOT_THRESHOLD,
        }
        url = DEEPGRAM_URL + "?" + "&".join(f"{k}={v}" for k, v in query.items())
        socket = await websockets.connect(
            url, additional_headers={"Authorization": f"Token {self._api_key}"}
        )
        return DeepgramFluxSession(socket)


# ---------------------------------------------------------------- Cartesia

CARTESIA_URL = os.environ.get("TIRO_CARTESIA_URL", "wss://api.cartesia.ai/tts/websocket")
CARTESIA_VERSION = os.environ.get("TIRO_CARTESIA_VERSION", "2025-04-16")
CARTESIA_MODEL = os.environ.get("TIRO_CARTESIA_MODEL", "sonic-3")
CARTESIA_VOICE = os.environ.get("TIRO_CARTESIA_VOICE", "")
# Matches the recognizer's rate, so the client plays one format either way.
TTS_SAMPLE_RATE = 16_000


def cartesia_request(
    text: str, *, context_id: str, voice: str, more: bool, language: str = "en"
) -> str:
    """One incremental generation message. `continue` true means more text is
    coming for this context, which is what lets synthesis start on the tutor's
    first chunk instead of waiting for the whole reply."""
    return json.dumps(
        {
            "model_id": CARTESIA_MODEL,
            "transcript": text,
            "voice": {"mode": "id", "id": voice},
            "language": language,
            "context_id": context_id,
            "output_format": {
                "container": "raw",
                "encoding": "pcm_s16le",
                "sample_rate": TTS_SAMPLE_RATE,
            },
            "continue": more,
        }
    )


def cartesia_audio(message: str) -> tuple[bytes, bool]:
    """Translate one Cartesia server message into (audio, finished)."""
    try:
        payload = json.loads(message)
    except ValueError:
        return b"", False
    kind = str(payload.get("type", ""))
    if kind == "chunk":
        data = str(payload.get("data", ""))
        return base64.b64decode(data) if data else b"", bool(payload.get("done"))
    if kind in ("done", "error"):
        return b"", True
    return b"", False


class CartesiaSonicTts:
    def __init__(self, api_key: str | None = None, voice: str | None = None) -> None:
        self._api_key = api_key or os.environ.get("TIRO_CARTESIA_API_KEY")
        self._voice = voice or CARTESIA_VOICE

    @property
    def provider(self) -> str:
        return "cartesia-sonic"

    async def stream(
        self, text_chunks: AsyncIterator[str], *, voice: str | None = None
    ) -> AsyncIterator[bytes]:
        """Feed the tutor's chunks in as they arrive and yield audio out.

        Cancellation is barge-in: when the consumer stops iterating, the
        generator's finally block cancels the context so the provider stops
        billing and stops sending, which is the seam's contract.
        """
        context_id = uuid.uuid4().hex
        url = f"{CARTESIA_URL}?cartesia_version={CARTESIA_VERSION}"
        async with websockets.connect(
            url, additional_headers={"X-API-Key": self._api_key or ""}
        ) as socket:

            async def feed() -> None:
                async for chunk in text_chunks:
                    if chunk:
                        await socket.send(
                            cartesia_request(
                                chunk,
                                context_id=context_id,
                                voice=voice or self._voice,
                                more=True,
                            )
                        )
                await socket.send(
                    cartesia_request(
                        "", context_id=context_id, voice=voice or self._voice, more=False
                    )
                )

            feeder = asyncio.create_task(feed())
            try:
                async for message in socket:
                    if isinstance(message, bytes):
                        continue
                    audio, finished = cartesia_audio(message)
                    if audio:
                        yield audio
                    if finished:
                        return
            finally:
                feeder.cancel()
                with contextlib.suppress(asyncio.CancelledError, Exception):
                    await feeder
                with contextlib.suppress(Exception):
                    await socket.send(
                        json.dumps({"context_id": context_id, "cancel": True})
                    )


# ---------------------------------------------------------------- registry

STT_PROVIDERS = {"deepgram-flux": DeepgramFluxStt}
TTS_PROVIDERS = {"cartesia-sonic": CartesiaSonicTts}


def stt_from_env() -> SpeechToText | None:
    """The configured streaming recognizer, or None (typed-only sessions)."""
    name = os.environ.get("TIRO_STT_PROVIDER", "")
    if not name:
        return None
    if name not in STT_PROVIDERS:
        raise ValueError(
            f"unknown TIRO_STT_PROVIDER {name!r};"
            f" known providers: {', '.join(sorted(STT_PROVIDERS))}"
        )
    return STT_PROVIDERS[name]()


def tts_from_env() -> TextToSpeech | None:
    """The configured synthesizer, or None (caption replies only)."""
    name = os.environ.get("TIRO_TTS_PROVIDER", "")
    if not name:
        return None
    if name not in TTS_PROVIDERS:
        raise ValueError(
            f"unknown TIRO_TTS_PROVIDER {name!r};"
            f" known providers: {', '.join(sorted(TTS_PROVIDERS))}"
        )
    return TTS_PROVIDERS[name]()
