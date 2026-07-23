# tirocinium-mastery

Reference implementation of the Tirocinium mastery model, specification v0.2. Pure Rust library: state is a function of (evidence event stream, parameter set) and nothing else, which makes every state replayable, auditable, and property-testable. This crate becomes `platform_core::mastery` in the platform monorepo; the `python` feature flag reserves the PyO3 binding surface, to be wired through maturin alongside the rest of `platform_core`.

## Layout

- `src/params.rs`: every constant from spec section 7, versioned and serializable.
- `src/events.rs`: the evidence model (spec 3), including professor supersession.
- `src/engine.rs`: retention, the update step, stability, labels with hysteresis, the revisit predicate, and replay (spec 4 and 5).
- `src/lib.rs`: public surface plus the plain-language evidence trail (spec 9).
- `tests/scenarios.rs`: the spec's narrative examples as concrete numbers.
- `tests/properties.rs`: the section 8 and 10 guarantees as proptest properties (bounds, monotonicity, replay determinism, grinding resistance, zero-confidence inertness).
- `examples/trajectories.rs`: the five-minute explanation in runnable form.

## Build and test

Developed against Rust 1.75 (Ubuntu 24.04 distro toolchain); `serde` and `proptest` are pinned in `Cargo.toml` for that compatibility and can be unpinned on a newer toolchain.

```
cargo test
cargo run --example trajectories
```

## Calibration findings from this implementation

These fed back into the specification and are worth knowing before tuning parameters.

The v0.1 spec's "decay m before updating" rule was internally inconsistent and is amended in v0.2: it contradicted the spec's own relearning philosophy (4.1) and capped mastery near 0.5 under expanding-interval practice, making solid unreachable on the revisit queue's own rhythm. Under the v0.2 rule, stored m is the fresh-ability estimate and decay lives only in effective mastery.

Under v0.2 defaults, the trajectories are: steady daily correct practice reaches solid on day 6; expanding-interval practice (days 0, 1, 2, 4, 7, 12, 20) reaches solid on day 7 and holds it through a week idle on earned stability; ten perfect attempts crammed into one day never leave developing and collapse to shaky within a week. Cramming is structurally unrewarded, spaced work is structurally rewarded, and the revisit rhythm sustains solid, which is the intended shape of the whole model.

## Python bindings and the SQLite adapter

The `python` feature exposes the core to Python as `tirocinium_mastery`, built with maturin (`pip install maturin && maturin build --release`; a cp312 manylinux wheel is included in the bundle). The FFI surface is deliberately thin, JSON strings in and out with serde as the single source of shape truth: `default_params_json()`, `apply_json(state?, event, params)`, `replay_json(events, params)`, `supersede_json(events)`, and `view_json(state, now, params)` returning m_eff, retention, label, and the revisit flag together.

The companion `mastery_store/` package is the SQLite adapter from backend guide 6.6: it owns the concepts, case_study_concepts, evidence_events, and mastery_state tables in a course shard, records events with incremental apply through the Rust core, runs full supersession replays whenever a professor grade arrives (so a grade erases a misread's damage rather than outweighing it), and answers the two product questions directly: `seat_view()` for the mastery picture and `revisit_queue()` ordered most-faded first. It computes no model arithmetic in Python, so the property-tested implementation is the only implementation. Its pytest suite verifies, among other things, that the incrementally-maintained cache is byte-identical to a fresh replay, which is the adapter-level form of the determinism property.
