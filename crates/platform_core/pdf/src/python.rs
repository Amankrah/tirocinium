//! `PyO3` bindings (feature `python`), registered into the `platform_core`
//! umbrella module as the `pdf` submodule. Bytes of a PDF and the pdfium
//! library path in; a list of per-page tuples out:
//! `(page_index, kind, text_markdown | None, image_png)`. The GIL is released
//! around the pdfium work (backend guide section 2).
#![allow(clippy::needless_pass_by_value)]

use pyo3::exceptions::PyValueError;
use pyo3::prelude::*;
use pyo3::types::PyBytes;

type PyPage<'py> = (usize, String, Option<String>, Bound<'py, PyBytes>);

/// Decode a PDF's pages. `render_width` defaults to 1654 px (about 200 dpi on
/// A4 width), enough detail for the vision seam on scanned pages.
#[pyfunction]
#[pyo3(signature = (pdf, lib_path, render_width=1654))]
fn decode(
    py: Python<'_>,
    pdf: Vec<u8>,
    lib_path: String,
    render_width: i32,
) -> PyResult<Vec<PyPage<'_>>> {
    let pages = py
        .allow_threads(|| crate::decode(&lib_path, &pdf, render_width))
        .map_err(PyValueError::new_err)?;
    Ok(pages
        .into_iter()
        .map(|page| {
            (
                page.page_index,
                page.kind.as_str().to_string(),
                page.text_markdown,
                PyBytes::new(py, &page.image_png),
            )
        })
        .collect())
}

/// Register the pdf surface onto a (sub)module.
///
/// # Errors
/// Propagates `PyO3` registration failures.
pub fn register(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(decode, m)?)?;
    Ok(())
}
