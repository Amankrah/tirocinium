"""The provider adapters' wire translation. The sockets themselves are live
integrations and belong to the non-blocking smoke lane, but the mapping between
each provider's protocol and our two-flag seam is pure and is pinned here,
because that mapping is where a provider's semantics can quietly change the
meaning of a turn boundary, and a wrong turn boundary corrupts the evidence the
rubric later produces (decision 0044).

The registry is pinned for the opposite reason: with nothing configured the
platform must fall to typed, captioned sessions rather than guess a provider,
and a misspelled provider name must fail loudly at startup rather than silently
disable speech.
"""

import base64
import json

import pytest

from app.defense.speech_providers import (
    CARTESIA_MODEL,
    DEEPGRAM_URL,
    cartesia_audio,
    cartesia_request,
    flux_events,
    stt_from_env,
    tts_from_env,
)


def turn_info(event: str, transcript: str = "") -> str:
    return json.dumps({"type": "TurnInfo", "event": event, "transcript": transcript})


def test_only_end_of_turn_commits_a_student_turn() -> None:
    """Flux reports turn state, not raw partials. `EndOfTurn` is the single
    event that closes a turn; the eager ending is a final without an endpoint,
    so the engine never commits a boundary the recognizer may retract."""
    (committed,) = flux_events(turn_info("EndOfTurn", "I used Ohm's law"))
    assert (committed.text, committed.final, committed.endpoint) == (
        "I used Ohm's law",
        True,
        True,
    )
    (eager,) = flux_events(turn_info("EagerEndOfTurn", "I used Ohm's"))
    assert (eager.final, eager.endpoint) == (True, False)
    (interim,) = flux_events(turn_info("Update", "I used"))
    assert (interim.final, interim.endpoint) == (False, False)
    # A retraction is an interim result, which the engine reads as barge-in.
    (resumed,) = flux_events(turn_info("TurnResumed", "I used Ohm's law and"))
    assert (resumed.final, resumed.endpoint) == (False, False)


def test_noise_on_the_recognizer_socket_is_ignored() -> None:
    """Anything that is not a transcript-bearing turn event yields nothing:
    keepalives, metadata, empty updates, and malformed frames alike."""
    assert flux_events(turn_info("Update", "")) == []
    assert flux_events(turn_info("Unknown", "text")) == []
    assert flux_events(json.dumps({"type": "Metadata", "request_id": "x"})) == []
    assert flux_events("not json at all") == []


def test_the_recognizer_defaults_to_the_eu_endpoint_and_flux() -> None:
    """Flux lives on /v2/listen (v1 does not serve it) and the EU hostname is
    the one residency choice we can make in code."""
    assert DEEPGRAM_URL == "wss://api.eu.deepgram.com/v2/listen"


def test_synthesis_is_incremental_under_one_context() -> None:
    """The reply is spoken while it is still being written: each tutor chunk
    goes out under one context id with `continue` true, and the final empty
    message closes it. That is what buys the time to first audio."""
    first = json.loads(
        cartesia_request("Why did you", context_id="ctx", voice="v", more=True)
    )
    last = json.loads(cartesia_request("", context_id="ctx", voice="v", more=False))

    assert first["continue"] is True
    assert last["continue"] is False
    assert first["context_id"] == last["context_id"] == "ctx"
    assert first["model_id"] == CARTESIA_MODEL
    assert first["voice"] == {"mode": "id", "id": "v"}
    # One audio format for the whole platform: raw 16 kHz mono PCM, the same
    # the browser records in, so the client plays without transcoding.
    assert first["output_format"] == {
        "container": "raw",
        "encoding": "pcm_s16le",
        "sample_rate": 16_000,
    }


def test_audio_frames_decode_and_the_stream_ends_once() -> None:
    audio = b"\x01\x02\x03\x04"
    chunk = json.dumps(
        {"type": "chunk", "data": base64.b64encode(audio).decode(), "done": False}
    )
    assert cartesia_audio(chunk) == (audio, False)
    assert cartesia_audio(json.dumps({"type": "done"})) == (b"", True)
    # An error ends the stream rather than hanging the turn; the engine's
    # degradation path turns that into captions (kind 'audio_down').
    assert cartesia_audio(json.dumps({"type": "error", "error": "no capacity"})) == (
        b"",
        True,
    )
    assert cartesia_audio(json.dumps({"type": "timestamps"})) == (b"", False)
    assert cartesia_audio("not json at all") == (b"", False)


def test_nothing_configured_means_a_typed_captioned_session(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("TIRO_STT_PROVIDER", raising=False)
    monkeypatch.delenv("TIRO_TTS_PROVIDER", raising=False)

    assert stt_from_env() is None
    assert tts_from_env() is None


def test_an_unknown_provider_name_fails_loudly(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Silently running without speech because of a typo would look exactly
    like a deployment that chose captions, so it raises instead."""
    monkeypatch.setenv("TIRO_STT_PROVIDER", "deepgram-nova")
    with pytest.raises(ValueError, match="deepgram-flux"):
        stt_from_env()

    monkeypatch.setenv("TIRO_TTS_PROVIDER", "elevenlabs")
    with pytest.raises(ValueError, match="cartesia-sonic"):
        tts_from_env()


def test_the_configured_providers_are_the_recorded_names(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The provider name is what the cost accounting stores per session, so it
    is part of the contract, not a label."""
    monkeypatch.setenv("TIRO_STT_PROVIDER", "deepgram-flux")
    monkeypatch.setenv("TIRO_TTS_PROVIDER", "cartesia-sonic")
    monkeypatch.setenv("TIRO_DEEPGRAM_API_KEY", "unused-in-tests")
    monkeypatch.setenv("TIRO_CARTESIA_API_KEY", "unused-in-tests")

    stt = stt_from_env()
    tts = tts_from_env()

    assert stt is not None and stt.provider == "deepgram-flux"
    assert tts is not None and tts.provider == "cartesia-sonic"
