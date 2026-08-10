"""Observability (milestone 8.5, backend guide section 8).

The phase gate's item is trace continuity across a full submission lifecycle:
the API call that completes a submission and the worker job that processes,
indexes, and emits evidence for it must be one trace, not four. That is
asserted here against real spans through an in-memory exporter, not against a
mock of the tracer.

The rest pins the structured-log contract, the Python-to-Rust boundary spans,
and the four dashboards' instruments, plus the standing no-PII rule, which
observability is the easiest place in the codebase to breach by accident.
"""

import json
import logging
from collections.abc import Iterator
from typing import Any

import pytest
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

from app.telemetry import (
    JsonFormatter,
    configure_logging,
    continued_span,
    current_trace_ids,
    native_span,
    record_api_latency,
    record_job_duration,
    record_queue_depth,
    record_recognition_confidence,
    record_variant_verification,
    span,
    trace_carrier,
)


@pytest.fixture()
def spans() -> Iterator[InMemorySpanExporter]:
    """A real tracer provider exporting to memory, installed for the test and
    removed after, so assertions are about spans that actually happened."""
    exporter = InMemorySpanExporter()
    provider = TracerProvider()
    provider.add_span_processor(SimpleSpanProcessor(exporter))
    previous = trace.get_tracer_provider()
    trace._TRACER_PROVIDER = provider
    try:
        yield exporter
    finally:
        trace._TRACER_PROVIDER = previous


def names(exporter: InMemorySpanExporter) -> list[str]:
    return [s.name for s in exporter.get_finished_spans()]


def trace_ids(exporter: InMemorySpanExporter) -> set[int]:
    return {s.context.trace_id for s in exporter.get_finished_spans() if s.context}


# ------------------------------------------------------------------ trace basics


def test_a_span_records_its_attributes(spans: InMemorySpanExporter) -> None:
    with span("read.submission", **{"course.id": 3}):
        pass

    finished = spans.get_finished_spans()
    assert names(spans) == ["read.submission"]
    assert finished[0].attributes is not None
    assert finished[0].attributes["course.id"] == 3


def test_a_failing_span_records_the_exception_and_re_raises(
    spans: InMemorySpanExporter,
) -> None:
    """Telemetry observes failures; it never swallows them."""
    with pytest.raises(ValueError, match="boom"), span("work"):
        raise ValueError("boom")

    finished = spans.get_finished_spans()[0]
    assert finished.status.is_ok is False
    assert finished.events, "the exception should be recorded on the span"


def test_nested_spans_share_one_trace(spans: InMemorySpanExporter) -> None:
    with span("outer"), span("inner"):
        pass

    assert len(trace_ids(spans)) == 1


# ------------------------------------------------------- the Python-Rust boundary


def test_the_native_boundary_is_its_own_span(spans: InMemorySpanExporter) -> None:
    """A slow preprocess or a slow pdfium decode has to be attributable, which
    means the boundary is visible in the trace rather than hidden inside a flat
    Python span."""
    with span("worker.process_submission"), native_span(
        "preprocess", "preprocess", **{"page.bytes": 2048}
    ):
        pass

    assert names(spans) == [
        "platform_core.preprocess.preprocess",
        "worker.process_submission",
    ]
    native = spans.get_finished_spans()[0]
    assert native.attributes is not None
    assert native.attributes["code.namespace"] == "platform_core.preprocess"
    assert native.attributes["code.function"] == "preprocess"
    assert native.attributes["page.bytes"] == 2048
    # The native span is a child of the Python work that called it.
    assert len(trace_ids(spans)) == 1
    assert native.parent is not None


# ------------------------------------------------------------ trace continuity


def test_a_carrier_continues_the_trace_across_the_queue(
    spans: InMemorySpanExporter,
) -> None:
    """The gate's property in its smallest form: what the API injects at
    enqueue is what the worker resumes, so the two are one trace."""
    with span("POST /submissions/1/complete"):
        carrier = trace_carrier()
    assert "traceparent" in carrier

    with continued_span("worker.process_submission", carrier):
        pass

    assert len(trace_ids(spans)) == 1, "the worker started its own trace"


def test_a_full_submission_lifecycle_is_one_trace(
    spans: InMemorySpanExporter,
) -> None:
    """The phase gate item: request, job, native work, indexing, and evidence
    emission all under one trace id, with the native boundary visible in it."""
    with span("POST /api/v1/submissions/1/complete"):
        carrier = trace_carrier()

    with continued_span("worker.process_submission", carrier, **{"submission.id": 1}):
        with native_span("preprocess", "preprocess", **{"page.bytes": 1024}):
            pass
        with span("transcribe.page"):
            pass
        with span("index.submission"), native_span("embedding", "quantize"):
            pass
        with span("emit.evidence"), native_span("compare", "answers_in_text"):
            pass

    assert len(trace_ids(spans)) == 1
    recorded = names(spans)
    for expected in (
        "POST /api/v1/submissions/1/complete",
        "worker.process_submission",
        "platform_core.preprocess.preprocess",
        "platform_core.embedding.quantize",
        "platform_core.compare.answers_in_text",
    ):
        assert expected in recorded


def test_a_missing_carrier_starts_a_new_trace_rather_than_failing(
    spans: InMemorySpanExporter,
) -> None:
    """Losing continuity must never lose the work: an old job enqueued without
    a carrier still runs."""
    with continued_span("worker.process_submission", None):
        pass
    with continued_span("worker.process_import", {}):
        pass

    assert len(spans.get_finished_spans()) == 2


def test_an_unparseable_carrier_starts_a_new_trace(spans: InMemorySpanExporter) -> None:
    with continued_span("worker.process_submission", {"traceparent": "nonsense"}):
        pass

    assert len(spans.get_finished_spans()) == 1


# ------------------------------------------------------------------ the worker seam


async def test_the_worker_runs_every_job_inside_the_enqueuing_trace(
    spans: InMemorySpanExporter,
) -> None:
    """`run_job` is the one place jobs get their telemetry, so a new job never
    has to remember to be instrumented."""
    from app.worker import run_job

    with span("POST /api/v1/imports/1/complete"):
        carrier = trace_carrier()

    async def work() -> str:
        return "ready"

    result = await run_job("process_import", carrier, work, **{"import.id": 1})

    assert result == "ready"
    assert "worker.process_import" in names(spans)
    assert len(trace_ids(spans)) == 1


async def test_a_failing_job_is_still_measured_and_still_raises(
    spans: InMemorySpanExporter,
) -> None:
    from app.worker import run_job

    async def work() -> str:
        raise RuntimeError("pipeline fell over")

    with pytest.raises(RuntimeError, match="fell over"):
        await run_job("process_submission", None, work)

    assert spans.get_finished_spans()[0].status.is_ok is False


# --------------------------------------------------------------- the dashboards


def test_the_four_dashboards_instruments_record() -> None:
    """The four the guide names: API latency, queue depth, and the two
    product-health metrics. Recording must not raise even with no exporter
    configured, which is the default in dev and in this suite."""
    record_api_latency("/api/v1/courses/{course_id}", "GET", 200, 12.5)
    record_queue_depth("arq:queue", 3)
    record_job_duration("process_submission", "ok", 900.0)
    record_recognition_confidence(0.87)
    record_variant_verification("verified")
    record_variant_verification("flagged")


def test_api_latency_is_labelled_by_route_template_not_path() -> None:
    """Ids in a metric label are unbounded cardinality and, worse here, they
    would put course and submission ids into the metrics backend. The
    middleware passes the matched template; this pins the intent."""
    from app.main import install_request_telemetry

    assert install_request_telemetry.__doc__ is not None
    assert "template" in install_request_telemetry.__doc__


# ------------------------------------------------------------- structured logs


def test_a_log_line_is_one_json_object() -> None:
    record = logging.LogRecord(
        "app.submissions", logging.INFO, __file__, 10, "submission completed", None, None
    )

    payload = json.loads(JsonFormatter().format(record))

    assert payload["level"] == "INFO"
    assert payload["logger"] == "app.submissions"
    assert payload["message"] == "submission completed"
    assert payload["ts"].endswith("Z")


def test_a_log_line_carries_its_trace(spans: InMemorySpanExporter) -> None:
    """A line and the span that produced it have to be joinable, or the traces
    and the logs are two separate stories about one incident."""
    formatter = JsonFormatter()
    with span("worker.process_submission"):
        ids = current_trace_ids()
        record = logging.LogRecord(
            "app.worker", logging.INFO, __file__, 10, "processing", None, None
        )
        payload = json.loads(formatter.format(record))

    assert ids is not None
    assert payload["trace_id"] == ids[0]
    assert payload["span_id"] == ids[1]


def test_a_log_line_outside_a_span_has_no_trace_id() -> None:
    record = logging.LogRecord("app", logging.INFO, __file__, 10, "starting", None, None)

    payload = json.loads(JsonFormatter().format(record))

    assert "trace_id" not in payload


def test_extra_context_is_merged_into_the_payload() -> None:
    record = logging.LogRecord("app.worker", logging.INFO, __file__, 10, "done", None, None)
    record.__dict__["submission_id"] = 42
    record.__dict__["seat_id"] = 7

    payload = json.loads(JsonFormatter().format(record))

    assert payload["submission_id"] == 42
    assert payload["seat_id"] == 7


def test_an_exception_is_formatted_into_the_line() -> None:
    try:
        raise ValueError("bad page")
    except ValueError:
        import sys

        record = logging.LogRecord(
            "app.worker", logging.ERROR, __file__, 10, "failed", None, sys.exc_info()
        )

    payload = json.loads(JsonFormatter().format(record))
    assert "ValueError: bad page" in payload["exception"]


def test_configuring_logging_twice_does_not_stack_handlers() -> None:
    root = logging.getLogger()
    before = len(root.handlers)

    configure_logging()
    once = len(root.handlers)
    configure_logging()
    twice = len(root.handlers)

    assert once == twice
    assert twice >= before


# --------------------------------------------------------------------- no PII


def test_telemetry_carries_ids_never_credentials(spans: InMemorySpanExporter) -> None:
    """Observability is the easiest place to leak by accident, so the rule is
    asserted where the leak would happen: spans and logs carry seat and course
    ids, which are not identifying, and never a seat code, which is a
    credential."""
    formatter = JsonFormatter()
    with span("POST /api/v1/seats/redeem", **{"course.id": 3, "seat.id": 14}):
        record = logging.LogRecord(
            "app.seats", logging.INFO, __file__, 10, "seat redeemed", None, None
        )
        record.__dict__["seat_id"] = 14
        line = formatter.format(record)

    finished = spans.get_finished_spans()[0]
    assert finished.attributes is not None
    emitted = json.dumps(dict(finished.attributes)) + line
    assert "MK4T" not in emitted  # a Crockford code never reaches telemetry
    assert '"seat.id": 14' in json.dumps(dict(finished.attributes))
    assert "seat_code" not in emitted
    assert "code" not in json.loads(line)


def test_no_span_attribute_helper_accepts_a_none_value(
    spans: InMemorySpanExporter,
) -> None:
    """None attributes are dropped rather than exported as the string 'None',
    which would be noise in every trace."""
    with span("work", **{"course.id": None, "submission.id": 5}):
        pass

    attributes: dict[str, Any] = dict(spans.get_finished_spans()[0].attributes or {})
    assert "course.id" not in attributes
    assert attributes["submission.id"] == 5


# --------------------------------------- the gate: the real lifecycle, one trace


async def test_the_real_submission_lifecycle_is_one_trace(
    spans: InMemorySpanExporter, tmp_path: Any
) -> None:
    """The phase gate item, driven through the real seams rather than the
    helpers: the enqueue seam injects the request's trace, and the real
    transcription pipeline runs under it, native preprocessing included. The
    trace that starts at the API call is the trace the worker finishes in.
    """
    import hashlib

    from app.db.shards import ShardManager
    from app.storage import SCANS_BUCKET
    from app.tasks import ArqTaskQueue
    from app.transcription.model import PageTranscription, RecordedTranscriber
    from app.transcription.pipeline import STATUS_PROCESSED, run_submission_pipeline
    from app.transcription.test_pipeline import (
        FakeStorage,
        RecordingBus,
        _seed,
        fake_preprocess_ok,
    )
    from app.worker import run_job

    class FakePool:
        def __init__(self) -> None:
            self.jobs: list[tuple[tuple[Any, ...], dict[str, Any]]] = []

        async def enqueue_job(self, *args: Any, **kwargs: Any) -> None:
            self.jobs.append((args, kwargs))

    pool = FakePool()
    queue = ArqTaskQueue(pool)

    # The API half: a request span, and the real enqueue seam inside it.
    with span("POST /api/v1/submissions/1/complete", **{"submission.id": 1}):
        await queue.enqueue_process_submission(1, 1)

    carrier = pool.jobs[0][1]["trace_context"]
    assert "traceparent" in carrier, "the enqueue seam did not inject a trace"

    # The worker half: the real pipeline, under the resumed trace.
    storage = FakeStorage()
    async with ShardManager(tmp_path) as shards:
        submission_id = await _seed(shards, storage, [b"page-0"])
        transcriber = RecordedTranscriber(
            {
                hashlib.sha256(b"gray:page-0").hexdigest(): PageTranscription(
                    markdown="Working", confidence=0.9
                )
            }
        )

        async def work() -> str:
            return await run_submission_pipeline(
                shards=shards,
                storage=storage,
                transcriber=transcriber,
                bus=RecordingBus(),
                course_id=1,
                submission_id=submission_id,
                preprocess=fake_preprocess_ok,
            )

        status = await run_job(
            "process_submission", carrier, work, **{"submission.id": submission_id}
        )

    assert status == STATUS_PROCESSED
    assert (SCANS_BUCKET, "scans/1/sub/pre/0.grayscale.png") in storage.objects

    # One trace across the whole lifecycle, with the native boundary inside it.
    assert len(trace_ids(spans)) == 1, "the lifecycle split into separate traces"
    recorded = names(spans)
    assert "POST /api/v1/submissions/1/complete" in recorded
    assert "worker.process_submission" in recorded
    assert "platform_core.preprocess.preprocess" in recorded


def test_the_four_dashboards_are_defined_and_name_real_instruments() -> None:
    """The dashboards are committed as data so they are reviewed like code.
    This pins that the file exists, names the guide's four, and refers to
    instruments this module actually emits, so an instrument rename cannot
    silently leave a dashboard querying nothing."""
    import pathlib

    definition = json.loads(
        (
            pathlib.Path(__file__).resolve().parents[3] / "infra" / "dashboards.json"
        ).read_text()
    )
    dashboards = definition["dashboards"]

    assert [d["name"] for d in dashboards] == [
        "API latency",
        "Queue depth",
        "Recognition confidence",
        "Variant verification pass rate",
    ]
    # Two infrastructure, two product-health: the distinction the guide draws.
    assert sorted(d["kind"] for d in dashboards) == [
        "infrastructure",
        "infrastructure",
        "product-health",
        "product-health",
    ]

    queries = " ".join(p["query"] for d in dashboards for p in d["panels"])
    for instrument in (
        "tirocinium_api_request_duration",
        "tirocinium_worker_queue_depth",
        "tirocinium_worker_job_duration",
        "tirocinium_recognition_confidence",
        "tirocinium_variant_verification",
    ):
        assert instrument in queries, f"no panel queries {instrument}"

    # No panel may group by anything identifying.
    for forbidden in ("seat", "submission_id", "course_id", "path="):
        assert forbidden not in queries, f"a dashboard groups by {forbidden}"
