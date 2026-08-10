"""Observability (milestone 8.5, backend guide section 8).

Three things the guide asks for: structured JSON logs, OpenTelemetry traces
that stay continuous across the Python and Rust boundary, and the four
dashboards, of which two (recognition confidence distribution, variant
verification pass rate) are product-health metrics rather than infrastructure
ones.

Some notes on what this module does and does not claim.

Spans at the Rust boundary are opened on the Python side, immediately around
the PyO3 call, rather than emitted from inside the crate. What the guide asks
for is that a trace stay continuous across the boundary, and this delivers
that: native work appears as its own span, parented to whatever Python was
doing, with the member, the function, and the size of what went in, so a slow
preprocess or a slow pdfium decode is attributable rather than hidden inside a
flat Python span. Emitting spans from within Rust would mean an OpenTelemetry
SDK in the crate plus context plumbed through every PyO3 signature, for
timings the boundary span already reports. The codec is deliberately not
instrumented: every compressed blob would become a span, and a trace drowned in
thousands of 40 microsecond spans is less observable, not more.

Nothing here is required for the platform to run. With no exporter configured
the SDK still creates spans and drops them, which costs little and keeps the
code paths identical between dev and production; `TIRO_OTEL_ENDPOINT` turns on
OTLP export and the dashboards with it.

The no-PII rule reaches here too, and it is the reason this module owns log
formatting rather than leaving it to each call site. Spans and log records
carry seat ids and course ids, never a seat code, and there is nothing else
about a student to leak because nothing else is stored.
"""

import json
import logging
import os
import time
from collections.abc import Callable, Iterator, Mapping
from contextlib import contextmanager
from typing import Any

from opentelemetry import metrics, propagate, trace
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.trace import Span, Status, StatusCode

SCOPE = "tirocinium"

_configured = False


def _endpoint() -> str | None:
    return os.environ.get("TIRO_OTEL_ENDPOINT") or None


def configure_telemetry(service_name: str = "tirocinium-api") -> None:
    """Install the tracer and meter providers once per process. Safe to call
    from the API factory and the worker startup both; the second call is a
    no-op, which is what keeps the test suite from stacking providers."""
    global _configured
    if _configured:
        return
    _configured = True

    resource = Resource.create(
        {
            "service.name": os.environ.get("TIRO_OTEL_SERVICE_NAME", service_name),
            "service.version": os.environ.get("TIRO_VERSION", "0.1.0"),
        }
    )
    endpoint = _endpoint()

    tracer_provider = TracerProvider(resource=resource)
    readers = []
    if endpoint is not None:
        from opentelemetry.exporter.otlp.proto.http.metric_exporter import (
            OTLPMetricExporter,
        )
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import (
            OTLPSpanExporter,
        )

        tracer_provider.add_span_processor(
            BatchSpanProcessor(OTLPSpanExporter(endpoint=f"{endpoint}/v1/traces"))
        )
        readers.append(
            PeriodicExportingMetricReader(
                OTLPMetricExporter(endpoint=f"{endpoint}/v1/metrics")
            )
        )
    trace.set_tracer_provider(tracer_provider)
    metrics.set_meter_provider(MeterProvider(resource=resource, metric_readers=readers))


def tracer() -> trace.Tracer:
    return trace.get_tracer(SCOPE)


def meter() -> metrics.Meter:
    return metrics.get_meter(SCOPE)


# --------------------------------------------------------------- the four dashboards

_instruments: dict[str, Any] = {}


def _instrument(key: str, build: Callable[[], Any]) -> Any:
    """Instruments are built lazily and cached, so importing this module never
    forces a meter provider into existence before configuration runs."""
    if key not in _instruments:
        _instruments[key] = build()
    return _instruments[key]


def record_api_latency(route: str, method: str, status_code: int, ms: float) -> None:
    """Dashboard one: API latency. Recorded per request by the middleware, by
    route template rather than path, so ids never become label cardinality."""
    _instrument(
        "api_latency",
        lambda: meter().create_histogram(
            "tirocinium.api.request.duration",
            unit="ms",
            description="API request duration by route",
        ),
    ).record(ms, {"route": route, "method": method, "status_code": status_code})


def record_queue_depth(queue: str, depth: int) -> None:
    """Dashboard two: queue depth. A gauge, not a counter, because depth is a
    level and not an accumulation. Reported by the worker, which is the process
    that can see the broker."""
    _instrument(
        "queue_depth",
        lambda: meter().create_gauge(
            "tirocinium.worker.queue.depth",
            description="Jobs waiting on the worker queue",
        ),
    ).set(depth, {"queue": queue})


def record_job_duration(job: str, outcome: str, ms: float) -> None:
    """The other half of the queue picture: how long jobs take, and whether
    they succeeded, which is what makes a rising depth interpretable."""
    _instrument(
        "job_duration",
        lambda: meter().create_histogram(
            "tirocinium.worker.job.duration",
            unit="ms",
            description="Worker job duration",
        ),
    ).record(ms, {"job": job, "outcome": outcome})


def record_recognition_confidence(confidence: float) -> None:
    """Dashboard three, a product-health metric: how confidently the reader is
    reading real student handwriting. Recorded per page as the pipeline reads
    it, so the distribution is live rather than a query over history."""
    _instrument(
        "recognition_confidence",
        lambda: meter().create_histogram(
            "tirocinium.recognition.confidence",
            description="Per-page handwriting recognition confidence",
        ),
    ).record(confidence)


def record_variant_verification(result: str) -> None:
    """Dashboard four, the other product-health metric: the share of generated
    variants the independent re-solve agreed with. Counted at the moment of
    the decision, with 'verified' and 'flagged' the two outcomes that make up
    the rate."""
    _instrument(
        "variant_verification",
        lambda: meter().create_counter(
            "tirocinium.variant.verification",
            description="Variant verification outcomes",
        ),
    ).add(1, {"result": result})


# ------------------------------------------------------------------------ spans


@contextmanager
def span(name: str, **attributes: Any) -> Iterator[Span]:
    """A span with attributes, recording an exception and an error status if
    the block raises, then re-raising."""
    with tracer().start_as_current_span(name) as current:
        for key, value in attributes.items():
            if value is not None:
                current.set_attribute(key, value)
        try:
            yield current
        except Exception as error:
            current.record_exception(error)
            current.set_status(Status(StatusCode.ERROR, str(error)))
            raise


@contextmanager
def native_span(member: str, function: str, **attributes: Any) -> Iterator[Span]:
    """The Python-to-Rust boundary, made visible. Wrap the PyO3 call itself and
    nothing else, so the span's duration is native work and not the Python
    around it."""
    with span(
        f"platform_core.{member}.{function}",
        **{"code.namespace": f"platform_core.{member}", "code.function": function},
        **attributes,
    ) as current:
        yield current


def trace_carrier() -> dict[str, str]:
    """The current trace context as a W3C carrier, to travel with an enqueued
    job so the worker's spans join the request's trace rather than starting a
    new one."""
    carrier: dict[str, str] = {}
    propagate.inject(carrier)
    return carrier


@contextmanager
def continued_span(
    name: str, carrier: Mapping[str, str] | None, **attributes: Any
) -> Iterator[Span]:
    """Resume a trace from an enqueued job's carrier. An absent or unparseable
    carrier simply starts a new trace: losing continuity must never lose the
    work."""
    context = propagate.extract(dict(carrier)) if carrier else None
    with tracer().start_as_current_span(name, context=context) as current:
        for key, value in attributes.items():
            if value is not None:
                current.set_attribute(key, value)
        try:
            yield current
        except Exception as error:
            current.record_exception(error)
            current.set_status(Status(StatusCode.ERROR, str(error)))
            raise


def current_trace_ids() -> tuple[str, str] | None:
    """The active (trace_id, span_id) as hex, or None outside a recording
    span. Used by the log formatter to tie a line to its trace."""
    context = trace.get_current_span().get_span_context()
    if not context.is_valid:
        return None
    return format(context.trace_id, "032x"), format(context.span_id, "016x")


# ----------------------------------------------------------------- structured logs

# Attributes LogRecord always carries; anything else a caller attached with
# `extra=` is ours and belongs in the payload.
_RESERVED = frozenset(
    vars(logging.LogRecord("", 0, "", 0, "", None, None)).keys()
    | {"message", "asctime", "taskName"}
)


class JsonFormatter(logging.Formatter):
    """One JSON object per line, with the trace and span id when there is one,
    so a log line and the span that produced it can be put side by side.

    Whatever a call site passes as `extra=` is merged in, which is the
    intended way to add context: seat ids, course ids, submission ids. Never a
    seat code, never anything else about a student, because a seat code is a
    credential and there is nothing else about a student to log.
    """

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(record.created))
            + f".{int(record.msecs):03d}Z",
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        ids = current_trace_ids()
        if ids is not None:
            payload["trace_id"], payload["span_id"] = ids
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        for key, value in record.__dict__.items():
            if key not in _RESERVED:
                payload[key] = value
        return json.dumps(payload, default=str, sort_keys=True)


def configure_logging(level: int | None = None) -> None:
    """Install JSON logging on the root logger. Idempotent: it replaces its own
    handler rather than stacking one per call."""
    resolved = level if level is not None else logging.getLevelNamesMapping().get(
        os.environ.get("TIRO_LOG_LEVEL", "INFO").upper(), logging.INFO
    )
    root = logging.getLogger()
    for handler in list(root.handlers):
        if getattr(handler, "_tirocinium", False):
            root.removeHandler(handler)
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    handler._tirocinium = True  # type: ignore[attr-defined]
    root.addHandler(handler)
    root.setLevel(resolved)


def configure_observability(service_name: str = "tirocinium-api") -> None:
    """Both halves, for a process that wants the lot."""
    configure_telemetry(service_name)
    configure_logging()
