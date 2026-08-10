# 0050: observability, and where the Rust boundary spans come from

Milestone 8.5 asks for structured JSON logs, OpenTelemetry traces across the
Python and Rust boundary, and the four dashboards live. Three decisions were
needed. First, where the boundary spans originate: they are opened on the
Python side, immediately around the PyO3 call, rather than emitted from inside
the crate. What the guide asks for is that a trace stay continuous across the
boundary, and this delivers it, because native work appears as its own span
parented to the Python work that called it, carrying the member, the function,
and the size of the input, so a slow preprocess or a slow pdfium decode is
attributable instead of hidden inside a flat Python span. Emitting from within
Rust would mean an OpenTelemetry SDK in the crate and trace context plumbed
through every PyO3 signature, for timings the boundary span already reports;
that is a real difference from the most literal reading of "traces across the
boundary" and it is stated here rather than glossed. The codec is deliberately
uninstrumented: a span per compressed blob would bury a trace under thousands
of forty-microsecond spans and make it less observable, not more. Second, trace
continuity across the queue, which is the phase gate's item. Every enqueue
carries the caller's W3C context as a `trace_context` job keyword and the worker
resumes it, so a submission's whole lifecycle is one trace rather than four; it
is a keyword with a default so an old job still runs on a new worker and an
absent or unparseable carrier starts a fresh trace, because losing continuity
must never lose the work. `run_job` is the single place that happens, so adding
a job never means remembering to instrument it. Third, the dashboards are
committed as data (`infra/dashboards.json`) rather than clicked together in a
UI, so they are reviewed like code and a test pins that every panel queries an
instrument the code actually emits, which is what stops a rename leaving a
dashboard silently querying nothing. Two of the four are product-health metrics
and are recorded at the moment of the fact rather than queried from history:
recognition confidence as each page is read, verification outcome as the
re-solve decides. No metric label carries an identifier: API latency is labelled
by matched route template and never by path, so a course or submission id can
never reach the metrics backend, and nothing about a seat is a dimension
anywhere. With no `TIRO_OTEL_ENDPOINT` the SDK still creates spans and drops
them, so dev and production run identical code paths and the only difference is
whether anything is exported.
