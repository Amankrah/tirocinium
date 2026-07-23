//! Page quality metrics (backend guide section 4, Stage 2). These are the
//! numbers the early-rejection gates read and the numbers stored alongside a
//! page so a professor can see why a scan was flagged.

use image::GrayImage;
use imageproc::filter::laplacian_filter;

/// Mean pixel luminance (0..255). Drives the too-dark and blown-out gates.
pub fn mean_luminance(gray: &GrayImage) -> f64 {
    let pixels = gray.as_raw();
    if pixels.is_empty() {
        return 0.0;
    }
    let sum: u64 = pixels.iter().map(|&p| u64::from(p)).sum();
    sum as f64 / pixels.len() as f64
}

/// Luminance standard deviation: how much tone varies across the page. A
/// blank sheet or a featureless surface has almost none, which is what
/// separates blank from merely blurry (a soft page still has strokes).
pub fn luminance_std(gray: &GrayImage, mean: f64) -> f64 {
    let pixels = gray.as_raw();
    if pixels.is_empty() {
        return 0.0;
    }
    let variance = pixels
        .iter()
        .map(|&p| {
            let d = f64::from(p) - mean;
            d * d
        })
        .sum::<f64>()
        / pixels.len() as f64;
    variance.sqrt()
}

/// Focus score: the variance of the Laplacian. A sharp page has strong,
/// varied second derivatives at every ink edge; a blurred one has weak,
/// uniform ones, so a low variance means out of focus. This is the standard
/// no-reference blur measure and needs no ground truth.
pub fn blur_score(gray: &GrayImage) -> f64 {
    let laplacian = laplacian_filter(gray);
    let values = laplacian.as_raw();
    let n = values.len();
    if n == 0 {
        return 0.0;
    }
    let mean = values.iter().map(|&v| f64::from(v)).sum::<f64>() / n as f64;
    let variance = values
        .iter()
        .map(|&v| {
            let d = f64::from(v) - mean;
            d * d
        })
        .sum::<f64>()
        / n as f64;
    variance
}

/// Inked fraction of a binarized page: the share of pixels that are ink
/// (zero) rather than paper (255). Near zero means a blank photo; very high
/// means shadow or noise has swamped the threshold.
pub fn ink_coverage(binary: &GrayImage) -> f64 {
    let pixels = binary.as_raw();
    let n = pixels.len();
    if n == 0 {
        return 0.0;
    }
    let ink = pixels.iter().filter(|&&p| p < 128).count();
    ink as f64 / n as f64
}
