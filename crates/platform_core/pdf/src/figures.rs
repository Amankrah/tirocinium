//! Figure extraction, the deterministic detector of Stage 1b (backend guide
//! section 5, milestone 4.2). Walking a page's object tree, embedded raster
//! images are pulled from the PDF stream losslessly (a JPEG stream byte for
//! byte, any other raster as a lossless PNG of its decoded pixels, never a
//! resample), and clusters of vector paths that form a drawing are rendered as
//! a region crop at 300 dpi. This is the "figures are pixels from the
//! professor's original" constraint made mechanical: nothing here re-encodes a
//! photograph lossily or redraws a diagram.
//!
//! The figure bytes returned here go to object storage; they never enter a text
//! prompt (the markdown carries only a `fig://` token). Vision-proposed boxes
//! (the second detector) join during the Stage 2 segmentation pass, not here.

use pdfium_render::prelude::*;

use crate::{encode_png, pdfium};

// Vector-cluster thresholds (calibrated against the five-PDF corpus when it
// lands; a data change, like the preprocess crate's Thresholds). Paths within
// the gap merge into one cluster; a cluster is a drawing only if it gathers at
// least this many paths over at least this much area, which excludes a lone
// rule line or a table border from being mistaken for a figure.
const CLUSTER_GAP_PTS: f32 = 6.0;
const MIN_CLUSTER_PATHS: usize = 2;
const MIN_CLUSTER_AREA_PTS2: f32 = 2500.0;
const RENDER_DPI: f32 = 300.0;

/// A text block within this many points above or below a figure, and
/// horizontally overlapping it, is taken as a caption guess (the professor
/// confirms or replaces it in 4.4). Captions usually sit below, so below wins.
const CAPTION_GAP_PTS: f32 = 36.0;
const MAX_CAPTION_CHARS: usize = 200;

/// How a figure was obtained from the page.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FigureSource {
    /// A raster image embedded in the PDF, extracted from its stream.
    EmbeddedRaster,
    /// A cluster of vector paths rendered to a raster region.
    VectorRender,
    /// A crop of a rendered (scanned) page; proposed by the vision detector.
    PageCrop,
}

impl FigureSource {
    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            FigureSource::EmbeddedRaster => "embedded_raster",
            FigureSource::VectorRender => "vector_render",
            FigureSource::PageCrop => "page_crop",
        }
    }
}

/// One extracted figure: its provenance, its position on the source page, its
/// intrinsic pixel size, and its bytes (plus a 2x rendition for rendered
/// regions). `bbox` is `[x, y, w, h]` in page points with a top-left origin.
#[derive(Debug, Clone)]
pub struct ExtractedFigure {
    pub source: FigureSource,
    pub bbox: [f32; 4],
    pub width_px: u32,
    pub height_px: u32,
    /// `"jpeg"` when the embedded stream was kept byte for byte, else `"png"`.
    pub format: &'static str,
    pub image: Vec<u8>,
    pub image_2x: Option<Vec<u8>>,
    /// A guessed caption from nearby page text; the professor confirms it.
    pub caption: Option<String>,
}

/// A page's figures with the page's dimensions in points, which the caller
/// needs to place `fig://` tokens by relative position and to store the bbox.
#[derive(Debug, Clone)]
pub struct PageFigures {
    pub page_width: f32,
    pub page_height: f32,
    pub figures: Vec<ExtractedFigure>,
}

/// Extract the figures on one page of a PDF (deterministic detector only).
///
/// # Errors
/// When pdfium cannot load the document or read the page's objects.
pub fn extract_figures(lib_path: &str, pdf: &[u8], page_index: u16) -> Result<PageFigures, String> {
    let pdfium = pdfium(lib_path)?;
    let document = pdfium
        .load_pdf_from_byte_slice(pdf, None)
        .map_err(|e| e.to_string())?;
    let page = document
        .pages()
        .get(page_index.into())
        .map_err(|e| e.to_string())?;
    let page_width = page.width().value;
    let page_height = page.height().value;

    let mut figures = Vec::new();
    let mut path_rects: Vec<Rect> = Vec::new();
    let mut text_blocks: Vec<(Rect, String)> = Vec::new();
    for object in page.objects().iter() {
        let rect = rect_of(&object, page_height)?;
        if let Some(image) = object.as_image_object() {
            figures.push(extract_raster(image, rect)?);
        } else if let Some(text) = object.as_text_object() {
            text_blocks.push((rect, text.text()));
        } else if object.object_type() == PdfPageObjectType::Path {
            path_rects.push(rect);
        }
    }

    // The vector-path detector: cluster nearby paths into drawings and render
    // each qualifying region at 300 dpi, with a 2x rendition alongside.
    for (rect, path_count) in cluster_paths(&path_rects) {
        if path_count < MIN_CLUSTER_PATHS || rect.area() < MIN_CLUSTER_AREA_PTS2 {
            continue;
        }
        let (image, width_px, height_px) = render_region(&page, rect, RENDER_DPI)?;
        let (image_2x, _, _) = render_region(&page, rect, RENDER_DPI * 2.0)?;
        figures.push(ExtractedFigure {
            source: FigureSource::VectorRender,
            bbox: [rect.x, rect.y, rect.w, rect.h],
            width_px,
            height_px,
            format: "png",
            image,
            image_2x: Some(image_2x),
            caption: None,
        });
    }

    for figure in &mut figures {
        let fig = Rect {
            x: figure.bbox[0],
            y: figure.bbox[1],
            w: figure.bbox[2],
            h: figure.bbox[3],
        };
        figure.caption = guess_caption(fig, &text_blocks);
    }
    Ok(PageFigures {
        page_width,
        page_height,
        figures,
    })
}

/// Guess a figure's caption: the nearest horizontally-overlapping text block
/// within [`CAPTION_GAP_PTS`] below the figure, or above it if none is below.
fn guess_caption(fig: Rect, text_blocks: &[(Rect, String)]) -> Option<String> {
    let mut below: Option<(f32, &str)> = None;
    let mut above: Option<(f32, &str)> = None;
    for (rect, text) in text_blocks {
        let trimmed = text.trim();
        if trimmed.is_empty() || rect.x >= fig.right() || fig.x >= rect.right() {
            continue;
        }
        let below_gap = rect.y - fig.bottom();
        if (0.0..=CAPTION_GAP_PTS).contains(&below_gap)
            && below.is_none_or(|(gap, _)| below_gap < gap)
        {
            below = Some((below_gap, trimmed));
        }
        let above_gap = fig.y - rect.bottom();
        if (0.0..=CAPTION_GAP_PTS).contains(&above_gap)
            && above.is_none_or(|(gap, _)| above_gap < gap)
        {
            above = Some((above_gap, trimmed));
        }
    }
    below
        .or(above)
        .map(|(_, text)| text.chars().take(MAX_CAPTION_CHARS).collect())
}

/// A rectangle in page points, top-left origin.
#[derive(Debug, Clone, Copy)]
struct Rect {
    x: f32,
    y: f32,
    w: f32,
    h: f32,
}

impl Rect {
    fn right(self) -> f32 {
        self.x + self.w
    }
    fn bottom(self) -> f32 {
        self.y + self.h
    }
    fn area(self) -> f32 {
        self.w * self.h
    }
    /// Do the two rectangles touch or come within `gap` points of each other?
    fn near(self, other: Rect, gap: f32) -> bool {
        self.x - gap <= other.right()
            && other.x - gap <= self.right()
            && self.y - gap <= other.bottom()
            && other.y - gap <= self.bottom()
    }
    fn union(self, other: Rect) -> Rect {
        let x = self.x.min(other.x);
        let y = self.y.min(other.y);
        let right = self.right().max(other.right());
        let bottom = self.bottom().max(other.bottom());
        Rect {
            x,
            y,
            w: right - x,
            h: bottom - y,
        }
    }
}

/// The object's bounding box in page points, converted from pdfium's
/// bottom-left origin to a top-left origin (y grows downward).
fn rect_of(object: &PdfPageObject, page_height: f32) -> Result<Rect, String> {
    let bounds = object.bounds().map_err(|e| e.to_string())?;
    let left = bounds.left().value;
    let right = bounds.right().value;
    let top = bounds.top().value;
    let bottom = bounds.bottom().value;
    Ok(Rect {
        x: left,
        y: page_height - top,
        w: right - left,
        h: top - bottom,
    })
}

/// Greedily merge path rectangles that touch or nearly touch into clusters,
/// tracking how many paths each gathered. O(n^2) per pass, fine for a page's
/// path count.
fn cluster_paths(rects: &[Rect]) -> Vec<(Rect, usize)> {
    let mut clusters: Vec<(Rect, usize)> = rects.iter().map(|r| (*r, 1)).collect();
    let mut merged = true;
    while merged {
        merged = false;
        'scan: for i in 0..clusters.len() {
            for j in (i + 1)..clusters.len() {
                if clusters[i].0.near(clusters[j].0, CLUSTER_GAP_PTS) {
                    let (other_rect, other_count) = clusters.remove(j);
                    clusters[i].0 = clusters[i].0.union(other_rect);
                    clusters[i].1 += other_count;
                    merged = true;
                    break 'scan;
                }
            }
        }
    }
    clusters
}

/// Round a non-negative point-space value scaled to pixels. Rendered pixel
/// dimensions are bounded (page size times a fixed dpi) and never negative, so
/// the cast cannot truncate or lose the sign meaningfully.
#[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
fn px(value: f32) -> u32 {
    value.max(0.0).round() as u32
}

/// Render a page region to lossless PNG at the given dpi, by rendering the page
/// at that scale and cropping the region (top-left origin, page points). The
/// pixels are the professor's diagram; the region is hash-stable, not
/// byte-identical, because it is rendered rather than extracted.
fn render_region(page: &PdfPage, region: Rect, dpi: f32) -> Result<(Vec<u8>, u32, u32), String> {
    let scale = dpi / 72.0;
    let target_width = px(page.width().value * scale);
    let config = PdfRenderConfig::new()
        .set_target_width(i32::try_from(target_width).map_err(|e| e.to_string())?);
    let bitmap = page
        .render_with_config(&config)
        .map_err(|e| e.to_string())?;
    let full = bitmap.as_image().map_err(|e| e.to_string())?;

    let x = px(region.x * scale).min(full.width().saturating_sub(1));
    let y = px(region.y * scale).min(full.height().saturating_sub(1));
    let w = px(region.w * scale).max(1).min(full.width() - x);
    let h = px(region.h * scale).max(1).min(full.height() - y);
    let cropped = full.crop_imm(x, y, w, h);
    Ok((encode_png(&cropped)?, cropped.width(), cropped.height()))
}

/// A raster image object: keep a JPEG stream byte for byte, otherwise encode
/// the decoded pixels to lossless PNG. Never resamples.
fn extract_raster(image: &PdfPageImageObject, rect: Rect) -> Result<ExtractedFigure, String> {
    let bbox = [rect.x, rect.y, rect.w, rect.h];
    let raw = image.get_raw_image_data().map_err(|e| e.to_string())?;

    // A DCTDecode stream is a complete JPEG file (magic FF D8 FF); keeping it
    // untouched is the byte-identical path the gate requires.
    if raw.starts_with(&[0xFF, 0xD8, 0xFF]) {
        let width_px =
            u32::try_from(image.width().map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
        let height_px =
            u32::try_from(image.height().map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
        return Ok(ExtractedFigure {
            source: FigureSource::EmbeddedRaster,
            bbox,
            width_px,
            height_px,
            format: "jpeg",
            image: raw,
            image_2x: None,
            caption: None,
        });
    }

    // Any other raster (a raw or Flate-encoded bitmap) is not a standalone
    // file; decode its intrinsic pixels and encode lossless PNG (no resample).
    let decoded = image.get_raw_image().map_err(|e| e.to_string())?;
    let png = encode_png(&decoded)?;
    Ok(ExtractedFigure {
        source: FigureSource::EmbeddedRaster,
        bbox,
        width_px: decoded.width(),
        height_px: decoded.height(),
        format: "png",
        image: png,
        image_2x: None,
        caption: None,
    })
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::*;

    fn lib_path() -> Option<String> {
        if let Ok(path) = std::env::var("TIRO_PDFIUM_LIB") {
            if Path::new(&path).exists() {
                return Some(path);
            }
        }
        let vendor = concat!(env!("CARGO_MANIFEST_DIR"), "/vendor");
        [
            format!("{vendor}/bin/pdfium.dll"),
            format!("{vendor}/lib/libpdfium.so"),
            format!("{vendor}/lib/libpdfium.dylib"),
        ]
        .into_iter()
        .find(|candidate| Path::new(candidate).exists())
    }

    #[test]
    fn embedded_jpeg_is_extracted_byte_identical() {
        let Some(lib) = lib_path() else {
            eprintln!("pdfium not provisioned; skipping");
            return;
        };
        let pdf = include_bytes!("../tests/fixtures/embedded_image.pdf");
        let source = include_bytes!("../tests/fixtures/source.jpg");

        let page = extract_figures(&lib, pdf, 0).expect("extract");
        let figures = &page.figures;

        assert!(page.page_width > 0.0 && page.page_height > 0.0);
        assert_eq!(figures.len(), 1);
        let figure = &figures[0];
        assert_eq!(figure.source, FigureSource::EmbeddedRaster);
        assert_eq!(figure.format, "jpeg");
        // The professor's pixels, byte for byte: no re-encode, no resample.
        assert_eq!(figure.image.as_slice(), source.as_slice());
        assert_eq!((figure.width_px, figure.height_px), (120, 90));
        // The image sits below the caption line, not at the page origin.
        assert!(figure.bbox[1] > 0.0 && figure.bbox[2] > 0.0 && figure.bbox[3] > 0.0);
    }

    #[test]
    fn a_vector_drawing_is_rendered_as_a_region() {
        let Some(lib) = lib_path() else {
            eprintln!("pdfium not provisioned; skipping");
            return;
        };
        let pdf = include_bytes!("../tests/fixtures/vector_drawing.pdf");
        let figures = extract_figures(&lib, pdf, 0).expect("extract").figures;

        // The box and its two diagonals cluster into one drawing.
        assert_eq!(figures.len(), 1);
        let figure = &figures[0];
        assert_eq!(figure.source, FigureSource::VectorRender);
        assert_eq!(figure.format, "png");
        assert!(figure.image.starts_with(b"\x89PNG"));
        // The 2x rendition is present and genuinely double the resolution.
        let two_x = figure.image_2x.as_ref().expect("2x rendition");
        let one = image::load_from_memory(&figure.image).expect("decode 1x");
        let two = image::load_from_memory(two_x).expect("decode 2x");
        assert!(two.width() >= one.width() * 2 - 2 && two.width() <= one.width() * 2 + 2);
        assert!(figure.width_px > 0 && figure.height_px > 0);
    }

    #[test]
    fn a_text_only_page_has_no_figures() {
        let Some(lib) = lib_path() else {
            eprintln!("pdfium not provisioned; skipping");
            return;
        };
        let pdf = include_bytes!("../tests/fixtures/born_digital.pdf");
        let figures = extract_figures(&lib, pdf, 0).expect("extract").figures;
        assert!(figures.is_empty());
    }

    #[test]
    fn a_caption_below_a_figure_is_guessed() {
        let Some(lib) = lib_path() else {
            eprintln!("pdfium not provisioned; skipping");
            return;
        };
        let pdf = include_bytes!("../tests/fixtures/captioned_figure.pdf");
        let figures = extract_figures(&lib, pdf, 0).expect("extract").figures;
        assert_eq!(figures.len(), 1);
        assert_eq!(
            figures[0].caption.as_deref(),
            Some("Figure 1: the RC circuit.")
        );
    }

    #[test]
    fn figure_source_strings_are_stable() {
        assert_eq!(FigureSource::EmbeddedRaster.as_str(), "embedded_raster");
        assert_eq!(FigureSource::VectorRender.as_str(), "vector_render");
        assert_eq!(FigureSource::PageCrop.as_str(), "page_crop");
    }
}
