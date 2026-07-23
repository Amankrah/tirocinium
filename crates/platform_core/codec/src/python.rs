//! `PyO3` bindings (feature `python`), registered into the `platform_core`
//! umbrella module as the `codec` submodule. Bytes in, bytes out; the GIL is
//! released around the actual codec work so `FastAPI` workers stay
//! responsive on large blobs (backend guide section 2).
//!
//! Arguments arrive as owned `Vec<u8>` on purpose: `allow_threads` forbids
//! borrowing from Python memory, so the copy at the boundary is what buys
//! the GIL release.
#![allow(clippy::needless_pass_by_value)]

use pyo3::exceptions::PyValueError;
use pyo3::prelude::*;
use pyo3::types::PyBytes;

fn jerr(e: crate::CodecError) -> PyErr {
    PyValueError::new_err(e.to_string())
}

#[pyfunction]
fn train_dictionary(
    py: Python<'_>,
    samples: Vec<Vec<u8>>,
    capacity: usize,
) -> PyResult<Bound<'_, PyBytes>> {
    let dict = py
        .allow_threads(|| crate::train_dictionary(&samples, capacity))
        .map_err(jerr)?;
    Ok(PyBytes::new(py, &dict))
}

#[pyfunction]
#[pyo3(signature = (data, dictionary=None, level=None))]
fn compress(
    py: Python<'_>,
    data: Vec<u8>,
    dictionary: Option<Vec<u8>>,
    level: Option<i32>,
) -> PyResult<Bound<'_, PyBytes>> {
    let out = py
        .allow_threads(|| crate::compress(&data, dictionary.as_deref(), level))
        .map_err(jerr)?;
    Ok(PyBytes::new(py, &out))
}

#[pyfunction]
#[pyo3(signature = (data, dictionary=None))]
fn decompress(
    py: Python<'_>,
    data: Vec<u8>,
    dictionary: Option<Vec<u8>>,
) -> PyResult<Bound<'_, PyBytes>> {
    let out = py
        .allow_threads(|| crate::decompress(&data, dictionary.as_deref()))
        .map_err(jerr)?;
    Ok(PyBytes::new(py, &out))
}

/// Register the codec surface onto a (sub)module.
///
/// # Errors
/// Propagates `PyO3` registration failures.
pub fn register(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(train_dictionary, m)?)?;
    m.add_function(wrap_pyfunction!(compress, m)?)?;
    m.add_function(wrap_pyfunction!(decompress, m)?)?;
    m.add("DEFAULT_LEVEL", crate::DEFAULT_LEVEL)?;
    Ok(())
}
