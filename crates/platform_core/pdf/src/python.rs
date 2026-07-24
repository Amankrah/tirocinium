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

/// One figure: source, bbox in page points, pixel width and height, format,
/// image bytes, an optional 2x rendition, and an optional caption guess.
type PyFigure<'py> = (
    String,
    (f32, f32, f32, f32),
    u32,
    u32,
    String,
    Bound<'py, PyBytes>,
    Option<Bound<'py, PyBytes>>,
    Option<String>,
);

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

/// Extract the figures on one page (the deterministic detector of Stage 1b).
/// Returns `(page_width, page_height, figures)` in page points, so the caller
/// can place `fig://` tokens by relative position and store the bboxes.
#[pyfunction]
#[pyo3(signature = (pdf, lib_path, page_index))]
fn extract_figures(
    py: Python<'_>,
    pdf: Vec<u8>,
    lib_path: String,
    page_index: u16,
) -> PyResult<(f32, f32, Vec<PyFigure<'_>>)> {
    let page = py
        .allow_threads(|| crate::extract_figures(&lib_path, &pdf, page_index))
        .map_err(PyValueError::new_err)?;
    let figures = page
        .figures
        .into_iter()
        .map(|figure| {
            (
                figure.source.as_str().to_string(),
                (
                    figure.bbox[0],
                    figure.bbox[1],
                    figure.bbox[2],
                    figure.bbox[3],
                ),
                figure.width_px,
                figure.height_px,
                figure.format.to_string(),
                PyBytes::new(py, &figure.image),
                figure.image_2x.map(|bytes| PyBytes::new(py, &bytes)),
                figure.caption,
            )
        })
        .collect();
    Ok((page.page_width, page.page_height, figures))
}

/// One cropped region: (png bytes, x, y, w, h) in page pixels.
type PyRegion<'py> = (Bound<'py, PyBytes>, u32, u32, u32, u32);

/// Crop a page raster at normalized boxes (`[x, y, w, h]` in 0..1), for the
/// vision detector's `page_crop` figures. Returns `(page_width, page_height,
/// regions)` in pixels.
#[pyfunction]
fn crop_figures(
    py: Python<'_>,
    page_png: Vec<u8>,
    boxes: Vec<[f32; 4]>,
) -> PyResult<(u32, u32, Vec<PyRegion<'_>>)> {
    let (page_w, page_h, regions) = py
        .allow_threads(|| crate::crop_figures(&page_png, &boxes))
        .map_err(PyValueError::new_err)?;
    let out = regions
        .into_iter()
        .map(|region| {
            (
                PyBytes::new(py, &region.png),
                region.x,
                region.y,
                region.w,
                region.h,
            )
        })
        .collect();
    Ok((page_w, page_h, out))
}

/// Register the pdf surface onto a (sub)module.
///
/// # Errors
/// Propagates `PyO3` registration failures.
pub fn register(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(decode, m)?)?;
    m.add_function(wrap_pyfunction!(extract_figures, m)?)?;
    m.add_function(wrap_pyfunction!(crop_figures, m)?)?;
    Ok(())
}
