//! Scan preprocessing (backend guide section 4, Stage 2). One page of a
//! student's handwritten work arrives as camera bytes and leaves as two
//! renditions (a cleaned grayscale copy for the vision model and an adaptive
//! binarized copy) plus quality metrics, or as an early rejection carrying a
//! message the frontend can show the student ("Page 3 is too blurry, retake
//! it"). Everything here is a pure function of the input bytes: no shard, no
//! object storage, no global state, which is what keeps it testable against
//! the golden corpus the way the guide asks.
//!
//! Casts between pixel integers and floats are pervasive in image maths and
//! always intentional here (luminance sums, coverage ratios, rotation
//! angles), so the truncation and precision lints are allowed crate-wide
//! rather than sprinkled per line.
#![allow(
    clippy::cast_precision_loss,
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    clippy::cast_possible_wrap
)]

mod decode;
mod quality;
mod stages;

#[cfg(feature = "python")]
pub mod python;

use std::fmt;

use image::{DynamicImage, ImageFormat, Luma};
use serde::Serialize;

/// Tunable limits for the pipeline. Defaults follow the guide (2200 px long
/// edge) and are otherwise conservative first cuts to be recalibrated against
/// the golden corpus; they live in one struct so a recalibration is a data
/// change, not a code hunt.
#[derive(Debug, Clone, Copy)]
pub struct Thresholds {
    /// Downscale target: the longer edge is brought to at most this many px.
    pub max_long_edge: u32,
    /// Below this mean luminance (0..255) the page is too dark to read.
    pub min_mean_luminance: f64,
    /// Below this luminance standard deviation the page has no content worth
    /// reading: a blank sheet or a photo of a wall. Checked before the blur
    /// gate, because a featureless page is blank, not blurry.
    pub min_contrast_std: f64,
    /// Variance of the Laplacian below this reads as out-of-focus.
    pub min_blur_score: f64,
    /// Below this fraction of inked pixels the page looks blank.
    pub min_ink_coverage: f64,
    /// Above this fraction the binarization is drowning in shadow or noise.
    pub max_ink_coverage: f64,
}

impl Default for Thresholds {
    fn default() -> Self {
        Self {
            max_long_edge: 2200,
            min_mean_luminance: 45.0,
            min_contrast_std: 6.0,
            min_blur_score: 45.0,
            min_ink_coverage: 0.0025,
            max_ink_coverage: 0.85,
        }
    }
}

/// Per-page quality metrics, emitted on success and mirrored by a pydantic
/// model on the Python side. Higher `blur_score` is sharper; `skew_angle_deg`
/// is the tilt detected before correction; `ink_coverage` is the inked
/// fraction after binarization.
#[derive(Debug, Clone, Copy, Serialize, PartialEq)]
pub struct PageMetrics {
    pub width: u32,
    pub height: u32,
    pub mean_luminance: f64,
    pub blur_score: f64,
    pub skew_angle_deg: f64,
    pub ink_coverage: f64,
}

/// A successfully preprocessed page: two PNG renditions and the metrics. The
/// grayscale copy is deskewed and illumination-corrected (what the vision
/// model reads); the binarized copy is the adaptive-threshold rendition.
#[derive(Debug, Clone)]
pub struct PageOutput {
    pub grayscale_png: Vec<u8>,
    pub binarized_png: Vec<u8>,
    pub metrics: PageMetrics,
}

/// Why a page was rejected before producing renditions. The `message` reads
/// after a "Page N" prefix the caller supplies, since only the caller knows
/// the page's position in a submission.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RejectReason {
    Blurry,
    TooDark,
    Blank,
}

impl RejectReason {
    /// A stable machine code the frontend can branch on.
    #[must_use]
    pub fn code(self) -> &'static str {
        match self {
            RejectReason::Blurry => "blurry",
            RejectReason::TooDark => "too_dark",
            RejectReason::Blank => "blank",
        }
    }

    /// The message tail, designed to read after "Page N".
    #[must_use]
    pub fn message(self) -> &'static str {
        match self {
            RejectReason::Blurry => "is too blurry to read, please retake it in sharper focus",
            RejectReason::TooDark => "is too dark to read, please retake it in better light",
            RejectReason::Blank => "looks blank, please check you photographed the right page",
        }
    }
}

/// Failures the pipeline can report. `Rejected` is the expected, student-
/// facing outcome for an unreadable page; `Decode` and `Internal` are
/// operator-facing faults.
#[derive(Debug, Clone, PartialEq)]
pub enum PreprocessError {
    Decode(String),
    Rejected(RejectReason, PageMetrics),
    Internal(String),
}

impl fmt::Display for PreprocessError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            PreprocessError::Decode(e) => write!(f, "preprocess: could not decode image: {e}"),
            PreprocessError::Rejected(reason, _) => {
                write!(f, "preprocess: page {}", reason.message())
            }
            PreprocessError::Internal(e) => write!(f, "preprocess: {e}"),
        }
    }
}

impl std::error::Error for PreprocessError {}

/// Preprocess one page with the default thresholds.
///
/// # Errors
/// [`PreprocessError::Decode`] when the bytes are not a supported image,
/// [`PreprocessError::Rejected`] when the page is unreadable, and
/// [`PreprocessError::Internal`] on an encoding fault.
pub fn preprocess_page(bytes: &[u8]) -> Result<PageOutput, PreprocessError> {
    preprocess_page_with(bytes, &Thresholds::default())
}

/// Preprocess one page with explicit thresholds.
///
/// The stage order matches the guide: EXIF orientation, downscale, then the
/// cheap quality gates (dark, blur) before the expensive geometry so an
/// unreadable page is rejected fast, then deskew, illumination correction,
/// binarization, and the coverage gate.
///
/// # Errors
/// See [`preprocess_page`].
pub fn preprocess_page_with(
    bytes: &[u8],
    thresholds: &Thresholds,
) -> Result<PageOutput, PreprocessError> {
    let oriented = decode::decode_oriented(bytes)?;
    let downscaled = stages::downscale(&oriented, thresholds.max_long_edge);
    let gray = downscaled.to_luma8();
    let (width, height) = gray.dimensions();

    let mean_luminance = quality::mean_luminance(&gray);
    let contrast_std = quality::luminance_std(&gray, mean_luminance);
    let blur_score = quality::blur_score(&gray);
    let skew_angle_deg = stages::detect_skew_degrees(&gray);

    // Metrics are complete enough to attach to an early rejection before we
    // spend the geometry budget; ink coverage fills in after binarization.
    let mut metrics = PageMetrics {
        width,
        height,
        mean_luminance,
        blur_score,
        skew_angle_deg,
        ink_coverage: 0.0,
    };

    if mean_luminance < thresholds.min_mean_luminance {
        return Err(PreprocessError::Rejected(RejectReason::TooDark, metrics));
    }
    if contrast_std < thresholds.min_contrast_std {
        return Err(PreprocessError::Rejected(RejectReason::Blank, metrics));
    }
    if blur_score < thresholds.min_blur_score {
        return Err(PreprocessError::Rejected(RejectReason::Blurry, metrics));
    }

    let deskewed = stages::deskew(&gray, skew_angle_deg);
    let corrected = stages::correct_illumination(&deskewed);
    let binarized = stages::binarize(&corrected);

    let ink_coverage = quality::ink_coverage(&binarized);
    metrics.ink_coverage = ink_coverage;

    if ink_coverage < thresholds.min_ink_coverage {
        return Err(PreprocessError::Rejected(RejectReason::Blank, metrics));
    }
    if ink_coverage > thresholds.max_ink_coverage {
        return Err(PreprocessError::Rejected(RejectReason::TooDark, metrics));
    }

    Ok(PageOutput {
        grayscale_png: encode_png(&corrected)?,
        binarized_png: encode_png(&binarized)?,
        metrics,
    })
}

/// Encode a grayscale buffer as PNG bytes.
fn encode_png(gray: &image::ImageBuffer<Luma<u8>, Vec<u8>>) -> Result<Vec<u8>, PreprocessError> {
    let mut buf = std::io::Cursor::new(Vec::new());
    DynamicImage::ImageLuma8(gray.clone())
        .write_to(&mut buf, ImageFormat::Png)
        .map_err(|e| PreprocessError::Internal(format!("png encode: {e}")))?;
    Ok(buf.into_inner())
}
