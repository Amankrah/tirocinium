//! `PyO3` bindings (feature `python`), registered into the `platform_core`
//! umbrella module as the `preprocess` submodule. Camera bytes in; two PNG
//! renditions and a metrics JSON string out, or a `PageRejected` exception
//! whose args carry the reason code, the student-facing message tail, and the
//! metrics that triggered the rejection. The GIL is released around the
//! actual image work so `FastAPI` workers stay responsive on large pages
//! (backend guide section 2).
//!
//! Bytes arrive as an owned `Vec<u8>` on purpose: `allow_threads` forbids
//! borrowing from Python memory, so the copy at the boundary is what buys the
//! GIL release.
#![allow(clippy::needless_pass_by_value)]

use pyo3::exceptions::PyValueError;
use pyo3::prelude::*;
use pyo3::types::PyBytes;

use crate::{PageMetrics, PageOutput, PreprocessError};

pyo3::create_exception!(
    platform_core.preprocess,
    PageRejected,
    pyo3::exceptions::PyException,
    "An uploaded page was unreadable. args are (reason_code, message, metrics_json)."
);

fn metrics_json(metrics: &PageMetrics) -> String {
    serde_json::to_string(metrics).unwrap_or_else(|_| "{}".to_string())
}

fn to_pyerr(error: PreprocessError) -> PyErr {
    match error {
        PreprocessError::Rejected(reason, metrics) => {
            PageRejected::new_err((reason.code(), reason.message(), metrics_json(&metrics)))
        }
        other => PyValueError::new_err(other.to_string()),
    }
}

/// Preprocess one page. Returns `(grayscale_png, binarized_png, metrics_json)`
/// on success; raises `PageRejected` for an unreadable page and `ValueError`
/// for an undecodable one.
#[pyfunction]
fn preprocess(py: Python<'_>, data: Vec<u8>) -> PyResult<(Py<PyBytes>, Py<PyBytes>, String)> {
    let PageOutput {
        grayscale_png,
        binarized_png,
        metrics,
    } = py
        .allow_threads(|| crate::preprocess_page(&data))
        .map_err(to_pyerr)?;
    Ok((
        PyBytes::new(py, &grayscale_png).unbind(),
        PyBytes::new(py, &binarized_png).unbind(),
        metrics_json(&metrics),
    ))
}

/// Register the preprocess surface onto a (sub)module.
///
/// # Errors
/// Propagates `PyO3` registration failures.
pub fn register(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(preprocess, m)?)?;
    m.add("PageRejected", m.py().get_type::<PageRejected>())?;
    m.add("MAX_LONG_EDGE", crate::Thresholds::default().max_long_edge)?;
    Ok(())
}
