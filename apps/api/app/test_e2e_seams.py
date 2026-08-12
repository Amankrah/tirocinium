"""The browser-tier substitution, and the guard around it (decision 0064).

The property worth defending is not that the doubles work; it is that they are
not there unless someone asked for them. A live process that quietly answered
with a script would make every journey a lie, and a live process that quietly
fell back to a real provider because a directory was missing would spend money
on a CI run. Both directions are asserted here.
"""

import hashlib
import json
from pathlib import Path

import pytest

from app.defense.model import AnthropicTutor, RecordedTutor, get_tutor
from app.e2e import (
    FALLBACK_READING,
    RECORDED_DIR_ENV,
    FallbackTranscriber,
    StubEmbedder,
    StubWorkingAssessor,
    e2e_assessor,
    e2e_embedder,
    e2e_transcriber,
    e2e_tutor_dir,
    recorded_dir,
)
from app.transcription.model import PageTranscription, RecordedTranscriber


@pytest.fixture
def recorded(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """A minimal recorded directory of the shape scripts/seed_e2e.py writes."""
    (tmp_path / "transcription").mkdir()
    (tmp_path / "transcription" / ("a" * 64 + ".json")).write_text(
        json.dumps({"markdown": "x = 1", "confidence": 0.9, "regions": []}),
        encoding="utf-8",
    )
    (tmp_path / "defense").mkdir()
    (tmp_path / "defense" / "replies.json").write_text(
        json.dumps(["What did you assume there?"]), encoding="utf-8"
    )
    (tmp_path / "defense" / "rubrics.json").write_text(
        json.dumps(['{"concepts": [], "confidence": 0.5}']), encoding="utf-8"
    )
    monkeypatch.setenv(RECORDED_DIR_ENV, str(tmp_path))
    return tmp_path


def test_nothing_is_substituted_when_the_variable_is_unset(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The property that matters in every deployment and every developer
    shell: the doubles are absent, so the live seams stand."""
    monkeypatch.delenv(RECORDED_DIR_ENV, raising=False)
    assert recorded_dir() is None
    assert e2e_transcriber() is None
    assert e2e_embedder() is None
    assert e2e_assessor() is None
    assert e2e_tutor_dir() is None
    assert isinstance(get_tutor(), AnthropicTutor)


def test_an_empty_value_is_the_same_as_unset(monkeypatch: pytest.MonkeyPatch) -> None:
    """A CI expression that evaluates to nothing must not half-enable the mode."""
    monkeypatch.setenv(RECORDED_DIR_ENV, "")
    assert recorded_dir() is None
    assert isinstance(get_tutor(), AnthropicTutor)


def test_a_missing_directory_is_an_error_not_a_fallback(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The expensive failure mode. A misconfigured job must stop, not reach a
    provider and bill for it while reporting a green journey."""
    monkeypatch.setenv(RECORDED_DIR_ENV, str(tmp_path / "never-seeded"))
    with pytest.raises(RuntimeError) as refused:
        recorded_dir()
    assert RECORDED_DIR_ENV in str(refused.value)


def test_the_recorded_seams_are_returned_when_the_mode_is_on(recorded: Path) -> None:
    assert isinstance(e2e_transcriber(), FallbackTranscriber)
    assert isinstance(e2e_embedder(), StubEmbedder)
    assert isinstance(e2e_assessor(), StubWorkingAssessor)
    assert e2e_tutor_dir() == recorded / "defense"
    assert isinstance(get_tutor(), RecordedTutor)


def test_each_conversation_gets_its_own_script(recorded: Path) -> None:
    """The tutor is a request dependency, and its reply script is consumed in
    order. A shared instance would leave the second defence of a run with
    nothing to say, which reads as a broken tutor rather than a spent script."""
    first, second = get_tutor(), get_tutor()
    assert first is not second
    assert isinstance(first, RecordedTutor)
    assert isinstance(second, RecordedTutor)
    assert first.reply_calls == 0 and second.reply_calls == 0


@pytest.mark.asyncio
async def test_a_recorded_page_reads_from_its_recording() -> None:
    """The exact-key path, which is what journey two exercises: a page whose
    rendition the seeder knew gets its recorded reading, and the fallback never
    fires. Without this, the fallback could be masking a key that never matches
    and the whole recorded chain would be decorative."""
    page = b"the exact rendition bytes"
    recording = PageTranscription(markdown="the recorded reading", confidence=0.9)
    transcriber = FallbackTranscriber(
        RecordedTranscriber({hashlib.sha256(page).hexdigest(): recording}),
        FALLBACK_READING,
    )

    reading = await transcriber.transcribe(page, "p", model_id="m")

    assert reading == recording
    assert transcriber.fallbacks == 0


@pytest.mark.asyncio
async def test_an_unrecorded_page_falls_back_and_says_so(
    recorded: Path, caplog: pytest.LogCaptureFixture
) -> None:
    """Mode C draws with a pointer, so its page cannot be recorded in advance.
    The fallback lets that journey run, and logs every time it fires so a
    drifted key elsewhere is visible rather than silently papered over."""
    transcriber = e2e_transcriber()
    assert isinstance(transcriber, FallbackTranscriber)

    with caplog.at_level("WARNING"):
        reading = await transcriber.transcribe(b"not a recorded page", "p", model_id="m")

    assert reading == FALLBACK_READING
    assert transcriber.fallbacks == 1
    assert "No recorded reading" in caplog.text


@pytest.mark.asyncio
async def test_the_stub_embedder_is_deterministic_and_quantizes(
    recorded: Path,
) -> None:
    """It only has to be a fixed, non-degenerate vector: indexing quantizes
    whatever it returns, and a constant-zero vector would divide by zero
    there."""
    from platform_core import embedding

    embedder = StubEmbedder()
    once = await embedder.embed("total head 15.4 m", model_id="stub")
    twice = await embedder.embed("total head 15.4 m", model_id="stub")
    other = await embedder.embed("shaft power", model_id="stub")
    assert once == twice
    assert once != other
    codes, scale = embedding.quantize(once)
    assert len(codes) == len(once)
    assert scale > 0


@pytest.mark.asyncio
async def test_the_stub_assessor_names_no_concept(recorded: Path) -> None:
    """Emission drops concepts a case does not map, so an empty assessment
    emits nothing, which is the honest outcome for a seam nothing asserts on.
    A fabricated rubric score would enter the mastery model as evidence."""
    assessment = await StubWorkingAssessor().assess(
        "document", [], "prompt", model_id="stub"
    )
    assert assessment.concepts == []
