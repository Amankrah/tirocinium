//! PDF decode via pdfium (backend guide section 5 Stage 1, milestone 4.1
//! follow-up). Bytes of a PDF in, one [`DecodedPage`] per page out: its
//! classification (born digital vs scanned by probing the text layer), the
//! extracted text for born-digital pages, and a rendered raster of every page.
//! The scanned pages' text comes later from the vision seam in Python; this
//! crate does the deterministic pdfium work.
//!
//! pdfium is a native library loaded at runtime from a vendored binary
//! (provisioned by infra, not committed); the caller passes its path. pdfium is
//! not thread-safe, so a decode binds it for the duration of one document, which
//! suits the one-PDF-at-a-time worker.

mod figures;
#[cfg(feature = "python")]
pub mod python;
// Test support, shared by the unit tests and the integration-test corpus
// harness. Public only because an integration test links against the public
// API; it is not part of the crate's contract.
#[doc(hidden)]
pub mod testkit;

pub use figures::{
    crop_figures, extract_figures, CroppedRegion, ExtractedFigure, FigureSource, PageFigures,
};

use std::io::Cursor;
use std::sync::{Mutex, OnceLock};

use pdfium_render::prelude::*;

// pdfium initializes and tears down global process state on bind and drop, and
// re-initializing after a teardown aborts. So bind exactly once per process and
// never drop it: the first decode initializes pdfium from the given library
// path, every later decode reuses it. The mutex serializes that one-time init
// so two threads cannot both call FPDF_InitLibrary.
static PDFIUM: OnceLock<Pdfium> = OnceLock::new();
static INIT: Mutex<()> = Mutex::new(());

// pdfium keeps internal state across FFI calls, so per-call locking (the
// thread_safe feature) is not enough: two logical operations (load document,
// walk pages, extract text or objects) interleaving their calls corrupt each
// other's reads (observed as a page's text objects going missing under the
// parallel test harness). One document at a time is the crate's contract, so
// every public operation holds this lock end to end.
static OPERATION: Mutex<()> = Mutex::new(());

pub(crate) fn operation_lock() -> Result<std::sync::MutexGuard<'static, ()>, String> {
    OPERATION.lock().map_err(|e| e.to_string())
}

pub(crate) fn pdfium(lib_path: &str) -> Result<&'static Pdfium, String> {
    if let Some(existing) = PDFIUM.get() {
        return Ok(existing);
    }
    let _guard = INIT.lock().map_err(|e| e.to_string())?;
    if let Some(existing) = PDFIUM.get() {
        return Ok(existing);
    }
    let bindings = Pdfium::bind_to_library(lib_path).map_err(|e| e.to_string())?;
    let _ = PDFIUM.set(Pdfium::new(bindings));
    Ok(PDFIUM.get().expect("just set"))
}

/// A page with fewer than this many alphanumeric characters in its text layer
/// is treated as having no usable text, so it takes the scanned path (render
/// then vision) rather than born-digital extraction.
const MIN_TEXT_CHARS: usize = 8;

/// How a page's text is obtained.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PageKind {
    /// A real text layer: text is extracted from pdfium directly.
    BornDigital,
    /// No usable text layer: the rendered raster goes to the vision seam.
    Scanned,
}

impl PageKind {
    /// The stable string the Python layer and the shard use.
    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            PageKind::BornDigital => "born_digital",
            PageKind::Scanned => "scanned",
        }
    }
}

/// One decoded page.
#[derive(Debug, Clone)]
pub struct DecodedPage {
    pub page_index: usize,
    pub kind: PageKind,
    /// The extracted text for a born-digital page; `None` for a scanned page.
    pub text_markdown: Option<String>,
    /// A PNG raster of the whole page, the worker's cache key and the
    /// confirmation surface's image.
    pub image_png: Vec<u8>,
}

/// Decode every page of a PDF, binding pdfium from `lib_path` and rendering each
/// page to a raster `render_width` pixels wide (height follows the page aspect).
///
/// # Errors
/// When the library cannot be loaded, the document cannot be parsed, or a page
/// cannot be read or rendered.
pub fn decode(lib_path: &str, pdf: &[u8], render_width: i32) -> Result<Vec<DecodedPage>, String> {
    let _operation = operation_lock()?;
    let pdfium = pdfium(lib_path)?;
    let document = pdfium
        .load_pdf_from_byte_slice(pdf, None)
        .map_err(|e| e.to_string())?;
    let config = PdfRenderConfig::new().set_target_width(render_width);

    let mut pages = Vec::new();
    for (index, page) in document.pages().iter().enumerate() {
        let text = page.text().map_err(|e| e.to_string())?.all();
        let alnum = text.chars().filter(|c| c.is_alphanumeric()).count();
        let kind = if alnum >= MIN_TEXT_CHARS {
            PageKind::BornDigital
        } else {
            PageKind::Scanned
        };
        let image_png = render_png(&page, &config)?;
        let text_markdown = match kind {
            PageKind::BornDigital => Some(text.trim().to_string()),
            PageKind::Scanned => None,
        };
        pages.push(DecodedPage {
            page_index: index,
            kind,
            text_markdown,
            image_png,
        });
    }
    Ok(pages)
}

fn render_png(page: &PdfPage, config: &PdfRenderConfig) -> Result<Vec<u8>, String> {
    let bitmap = page.render_with_config(config).map_err(|e| e.to_string())?;
    encode_png(&bitmap.as_image().map_err(|e| e.to_string())?)
}

/// Encode a decoded image to lossless PNG. Shared by page rendering and the
/// figure extractor's non-JPEG raster path.
pub(crate) fn encode_png(image: &image::DynamicImage) -> Result<Vec<u8>, String> {
    let mut buffer = Vec::new();
    image
        .write_to(&mut Cursor::new(&mut buffer), image::ImageFormat::Png)
        .map_err(|e| e.to_string())?;
    Ok(buffer)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testkit;

    const PNG_MAGIC: &[u8] = b"\x89PNG\r\n\x1a\n";

    #[test]
    fn born_digital_page_extracts_text_and_renders() {
        let pdf = include_bytes!("../tests/fixtures/born_digital.pdf");
        let Some(lib) = testkit::ready(&[pdf]) else {
            return;
        };
        let pages = decode(&lib, pdf, 1000).expect("decode");
        assert_eq!(pages.len(), 1);
        let page = &pages[0];
        assert_eq!(page.kind, PageKind::BornDigital);
        assert!(
            page.text_markdown
                .as_deref()
                .unwrap_or("")
                .contains("net present value"),
            "got: {:?}",
            page.text_markdown
        );
        assert!(page.image_png.starts_with(PNG_MAGIC));
    }

    #[test]
    fn a_page_without_a_text_layer_is_scanned() {
        let pdf = include_bytes!("../tests/fixtures/no_text_layer.pdf");
        let Some(lib) = testkit::ready(&[pdf]) else {
            return;
        };
        let pages = decode(&lib, pdf, 1000).expect("decode");
        assert_eq!(pages.len(), 1);
        assert_eq!(pages[0].kind, PageKind::Scanned);
        assert!(pages[0].text_markdown.is_none());
        // Scanned pages still render, so the vision seam and the review surface
        // have an image to work from.
        assert!(pages[0].image_png.starts_with(PNG_MAGIC));
    }

    #[test]
    fn page_kind_strings_are_stable() {
        assert_eq!(PageKind::BornDigital.as_str(), "born_digital");
        assert_eq!(PageKind::Scanned.as_str(), "scanned");
    }
}
