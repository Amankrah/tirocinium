//! `PyO3` bindings (feature `python`), registered into the `platform_core`
//! umbrella module as the `compare` submodule. The comparison comes back as
//! its stable string (`match` | `mismatch` | `no_answers`), which is what the
//! verification loop stores and branches on. The GIL is released around the
//! parsing and comparison (backend guide section 2).
#![allow(clippy::needless_pass_by_value)]

use pyo3::prelude::*;

/// Compare two final-answer lists element by element, within tolerance.
#[pyfunction]
fn compare_answer_lists(
    py: Python<'_>,
    a: Vec<String>,
    b: Vec<String>,
    rel_tol: f64,
    abs_tol: f64,
) -> &'static str {
    py.allow_threads(|| crate::compare_answer_lists(&a, &b, rel_tol, abs_tol))
        .as_str()
}

/// Every number an answer displays, in reading order.
#[pyfunction]
fn parse_numbers(py: Python<'_>, text: String) -> Vec<f64> {
    py.allow_threads(|| crate::parse_numbers(&text))
}

/// Whether every expected final answer appears in a free-text transcription
/// (the `answer_match` evidence source).
#[pyfunction]
fn answers_in_text(
    py: Python<'_>,
    answers: Vec<String>,
    text: String,
    rel_tol: f64,
    abs_tol: f64,
) -> &'static str {
    py.allow_threads(|| crate::answers_in_text(&answers, &text, rel_tol, abs_tol))
        .as_str()
}

/// Register the `compare` submodule on the umbrella module.
///
/// # Errors
/// When a function cannot be added to the module.
pub fn register(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(compare_answer_lists, m)?)?;
    m.add_function(wrap_pyfunction!(parse_numbers, m)?)?;
    m.add_function(wrap_pyfunction!(answers_in_text, m)?)?;
    Ok(())
}
