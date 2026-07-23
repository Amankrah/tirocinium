//! PyO3 bindings (feature `python`). The boundary is deliberately thin:
//! JSON strings in, JSON strings out, with serde as the single source of
//! shape truth on the Rust side and pydantic models mirroring it on the
//! Python side. This keeps the FFI surface trivial to audit and lets the
//! Python layer evolve its models without touching Rust.
//!
//! All functions are pure and release the GIL implicitly by doing no
//! Python-object work beyond string conversion.

use crate::engine::{apply, compute_label, replay, State};
use crate::events::{apply_supersession, WeightedEvent};
use crate::params::Params;
use pyo3::exceptions::PyValueError;
use pyo3::prelude::*;

fn jerr(e: impl std::fmt::Display) -> PyErr {
    PyValueError::new_err(format!("tirocinium-mastery: {e}"))
}

/// The default parameter set (spec section 7) as JSON.
#[pyfunction]
fn default_params_json() -> PyResult<String> {
    serde_json::to_string(&Params::default()).map_err(jerr)
}

/// Apply one weighted event to a state. `state_json` may be None for the
/// first event of a (seat, concept). Returns the new state as JSON.
#[pyfunction]
#[pyo3(signature = (state_json, event_json, params_json))]
fn apply_json(state_json: Option<&str>, event_json: &str, params_json: &str) -> PyResult<String> {
    let params: Params = serde_json::from_str(params_json).map_err(jerr)?;
    let we: WeightedEvent = serde_json::from_str(event_json).map_err(jerr)?;
    let state: Option<State> = match state_json {
        Some(s) => Some(serde_json::from_str(s).map_err(jerr)?),
        None => None,
    };
    let next = apply(state.as_ref(), &we, &params);
    serde_json::to_string(&next).map_err(jerr)
}

/// Replay a full time-ordered stream of weighted events. Returns the state
/// as JSON, or None for an empty stream (the Unseen case).
#[pyfunction]
fn replay_json(events_json: &str, params_json: &str) -> PyResult<Option<String>> {
    let params: Params = serde_json::from_str(params_json).map_err(jerr)?;
    let events: Vec<WeightedEvent> = serde_json::from_str(events_json).map_err(jerr)?;
    match replay(&events, &params) {
        Some(st) => Ok(Some(serde_json::to_string(&st).map_err(jerr)?)),
        None => Ok(None),
    }
}

/// Filter a stream for professor supersession (spec 3, 4.6) and return the
/// filtered stream as JSON. Replay the result to get the superseded state.
#[pyfunction]
fn supersede_json(events_json: &str) -> PyResult<String> {
    let events: Vec<WeightedEvent> = serde_json::from_str(events_json).map_err(jerr)?;
    serde_json::to_string(&apply_supersession(&events)).map_err(jerr)
}

/// Effective mastery, retention, current label, and revisit-due flag for a
/// state at time `now` (unix seconds), returned together as JSON, since the
/// API layer always wants them together.
#[pyfunction]
fn view_json(state_json: &str, now: i64, params_json: &str) -> PyResult<String> {
    let params: Params = serde_json::from_str(params_json).map_err(jerr)?;
    let st: State = serde_json::from_str(state_json).map_err(jerr)?;
    let out = serde_json::json!({
        "m_eff": st.m_eff(now, &params),
        "retention": st.retention(now, &params),
        "label": compute_label(&st, now, &params),
        "due_for_revisit": st.due_for_revisit(now, &params),
    });
    serde_json::to_string(&out).map_err(jerr)
}

#[pymodule]
fn tirocinium_mastery(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(default_params_json, m)?)?;
    m.add_function(wrap_pyfunction!(apply_json, m)?)?;
    m.add_function(wrap_pyfunction!(replay_json, m)?)?;
    m.add_function(wrap_pyfunction!(supersede_json, m)?)?;
    m.add_function(wrap_pyfunction!(view_json, m)?)?;
    m.add("SPEC_VERSION", "0.2")?;
    Ok(())
}
