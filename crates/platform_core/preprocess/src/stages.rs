//! The geometry and tone stages of the pipeline (backend guide section 4,
//! Stage 2): downscale, Hough deskew, illumination correction, adaptive
//! binarization. Each is a pure function on image buffers.

use image::{DynamicImage, GrayImage, Luma};
use imageproc::contrast::adaptive_threshold;
use imageproc::edges::canny;
use imageproc::geometric_transformations::{rotate_about_center, Interpolation};
use imageproc::hough::{detect_lines, LineDetectionOptions, PolarLine};

/// Bring the longer edge down to `max_long_edge` px, preserving aspect ratio.
/// Pages already within budget pass through untouched. Lanczos keeps ink
/// edges crisp, which matters for the downstream binarization.
pub fn downscale(image: &DynamicImage, max_long_edge: u32) -> DynamicImage {
    let (w, h) = (image.width(), image.height());
    if w.max(h) <= max_long_edge {
        return image.clone();
    }
    image.resize(
        max_long_edge,
        max_long_edge,
        image::imageops::FilterType::Lanczos3,
    )
}

/// Detect the page skew in degrees via a Hough transform over Canny edges.
/// Handwriting has few long strokes, so the transform keys off the page
/// border and any ruling; when nothing dominant is near horizontal we report
/// zero skew rather than inventing a rotation. Detection runs on a work copy
/// capped at 1000 px so the transform stays inside the latency budget.
///
/// A positive result means the content is rotated clockwise from level.
pub fn detect_skew_degrees(gray: &GrayImage) -> f64 {
    let work = downscale_gray(gray, 1000);
    let edges = canny(&work, 50.0, 100.0);
    let options = LineDetectionOptions {
        vote_threshold: (work.width().min(work.height()) / 4).max(60),
        suppression_radius: 8,
    };
    let lines: Vec<PolarLine> = detect_lines(&edges, options);

    // A horizontal line's normal points at 90 degrees; a page tilted by a few
    // degrees shows up as near-horizontal lines whose angle deviates from 90.
    let mut deviations: Vec<f64> = lines
        .iter()
        .filter_map(|line| {
            let angle = f64::from(line.angle_in_degrees);
            let dev = angle - 90.0;
            if dev.abs() <= 15.0 {
                Some(dev)
            } else {
                None
            }
        })
        .collect();

    if deviations.is_empty() {
        return 0.0;
    }
    deviations.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    median(&deviations)
}

/// Rotate the page to level. Skews under a tenth of a degree are left alone
/// (rotation would only cost a resample for no visible gain). White fills the
/// corners exposed by the rotation, matching paper.
pub fn deskew(gray: &GrayImage, skew_deg: f64) -> GrayImage {
    if skew_deg.abs() < 0.1 {
        return gray.clone();
    }
    let theta = (skew_deg as f32).to_radians();
    rotate_about_center(gray, theta, Interpolation::Bilinear, Luma([255u8]))
}

/// Flatten uneven lighting by dividing out a low-frequency background
/// estimate. The estimate is built cheaply (downscale, blur, upscale) so a
/// shadow across the page or a warm desk lamp does not bias the following
/// binarization. Output is normalized so clean paper sits near white.
pub fn correct_illumination(gray: &GrayImage) -> GrayImage {
    const TARGET: f64 = 235.0;
    let (w, h) = gray.dimensions();
    let background = estimate_background(gray);

    let mut out = GrayImage::new(w, h);
    for (x, y, pixel) in out.enumerate_pixels_mut() {
        let value = f64::from(gray.get_pixel(x, y)[0]);
        let bg = f64::from(background.get_pixel(x, y)[0]).max(1.0);
        let corrected = (value / bg * TARGET).clamp(0.0, 255.0);
        *pixel = Luma([corrected as u8]);
    }
    out
}

/// Adaptive (local mean) threshold: a global threshold cannot serve a page
/// whose lighting still varies after correction, whereas a per-neighbourhood
/// threshold tracks it. The block radius scales with page size.
pub fn binarize(gray: &GrayImage) -> GrayImage {
    let (w, h) = gray.dimensions();
    let radius = (w.min(h) / 40).clamp(8, 60);
    adaptive_threshold(gray, radius)
}

/// Build a smooth background estimate: shrink, blur, grow back. Doing the
/// blur on a small copy makes the effective kernel enormous on the full page
/// for almost no cost.
fn estimate_background(gray: &GrayImage) -> GrayImage {
    let (w, h) = gray.dimensions();
    let small = downscale_gray(gray, 128);
    let blurred = imageproc::filter::gaussian_blur_f32(&small, 3.0);
    image::imageops::resize(&blurred, w, h, image::imageops::FilterType::Triangle)
}

/// Downscale a grayscale buffer so its longer edge is at most `max_edge`.
fn downscale_gray(gray: &GrayImage, max_edge: u32) -> GrayImage {
    let (w, h) = gray.dimensions();
    if w.max(h) <= max_edge {
        return gray.clone();
    }
    let scale = f64::from(max_edge) / f64::from(w.max(h));
    let nw = ((f64::from(w) * scale).round() as u32).max(1);
    let nh = ((f64::from(h) * scale).round() as u32).max(1);
    image::imageops::resize(gray, nw, nh, image::imageops::FilterType::Triangle)
}

fn median(sorted: &[f64]) -> f64 {
    let n = sorted.len();
    if n == 0 {
        return 0.0;
    }
    if n % 2 == 1 {
        sorted[n / 2]
    } else {
        f64::midpoint(sorted[n / 2 - 1], sorted[n / 2])
    }
}
