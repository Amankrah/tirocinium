//! `PyO3` bindings (feature `python`), registered into the `platform_core`
//! umbrella module as the `embedding` submodule. Int8 codes cross the boundary
//! as raw bytes (the `embeddings.vec_i8` BLOB is exactly these bytes), so a
//! code of `-1` is the byte `0xFF`; the reverse reinterpretation happens on the
//! way back in. The GIL is released around the arithmetic (backend guide
//! section 2).
// The int8<->byte conversions here are deliberate two's-complement
// reinterpretations of the `vec_i8` BLOB, not value casts, so the sign-loss
// and wrap lints do not apply.
#![allow(
    clippy::needless_pass_by_value,
    clippy::cast_sign_loss,
    clippy::cast_possible_wrap
)]

use pyo3::exceptions::PyValueError;
use pyo3::prelude::*;
use pyo3::types::PyBytes;

fn jerr(e: crate::EmbeddingError) -> PyErr {
    PyValueError::new_err(e.to_string())
}

fn as_i8(bytes: &[u8]) -> Vec<i8> {
    bytes.iter().map(|&b| b as i8).collect()
}

/// Quantize a float vector to `(int8 code bytes, scale)`.
#[pyfunction]
fn quantize(py: Python<'_>, vector: Vec<f32>) -> PyResult<(Bound<'_, PyBytes>, f32)> {
    let (codes, scale) = py
        .allow_threads(|| crate::quantize(&vector))
        .map_err(jerr)?;
    let bytes: Vec<u8> = codes.iter().map(|&c| c as u8).collect();
    Ok((PyBytes::new(py, &bytes), scale))
}

/// Reconstruct the approximate float vector from its code bytes and scale.
#[pyfunction]
fn dequantize(py: Python<'_>, codes: Vec<u8>, scale: f32) -> Vec<f32> {
    py.allow_threads(|| crate::dequantize(&as_i8(&codes), scale))
}

/// Cosine similarity of two vectors from their int8 code bytes.
#[pyfunction]
fn cosine_i8(py: Python<'_>, a: Vec<u8>, b: Vec<u8>) -> PyResult<f64> {
    py.allow_threads(|| crate::cosine_i8(&as_i8(&a), &as_i8(&b)))
        .map_err(jerr)
}

/// Register the embedding surface onto a (sub)module.
///
/// # Errors
/// Propagates `PyO3` registration failures.
pub fn register(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(quantize, m)?)?;
    m.add_function(wrap_pyfunction!(dequantize, m)?)?;
    m.add_function(wrap_pyfunction!(cosine_i8, m)?)?;
    Ok(())
}
