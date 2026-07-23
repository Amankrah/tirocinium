//! Property and behaviour tests for the preprocessing pipeline, built on
//! synthetic pages with known ground truth (induced skew, applied blur,
//! controlled tone). These exercise the algorithms and the rejection gates
//! deterministically; the golden-file suite over the real 30-photo corpus
//! (docs/decisions/0016) is the perceptual-tolerance regression guard and
//! runs separately once that project asset is assembled.
//!
//! Casts here are test-fixture drawing arithmetic with values kept in range
//! by construction, so the truncation and sign lints are allowed.
#![allow(clippy::cast_sign_loss, clippy::cast_possible_truncation)]

use std::io::Cursor;

use image::{DynamicImage, GrayImage, ImageFormat, Luma};
use imageproc::filter::gaussian_blur_f32;
use tirocinium_preprocess::{preprocess_page, PreprocessError, RejectReason};

/// Encode a grayscale buffer to PNG bytes, the way an upload arrives.
fn png_bytes(gray: &GrayImage) -> Vec<u8> {
    let mut buf = Cursor::new(Vec::new());
    DynamicImage::ImageLuma8(gray.clone())
        .write_to(&mut buf, ImageFormat::Png)
        .expect("encode");
    buf.into_inner()
}

/// A crisp page of dark strokes on light paper. `slope` tilts every stroke by
/// the same amount, standing in for a page photographed off-square.
fn text_page(w: u32, h: u32, slope: f64) -> GrayImage {
    let mut img = GrayImage::from_pixel(w, h, Luma([238]));
    for row in 0..20u32 {
        let y0 = 60 + row * 60;
        for x in 40..(w - 40) {
            let y = (f64::from(y0) + f64::from(x - 40) * slope).round() as i64;
            for t in 0..4i64 {
                let yy = y + t;
                if yy >= 0 && (yy as u32) < h {
                    img.put_pixel(x, yy as u32, Luma([28]));
                }
            }
        }
    }
    img
}

fn blur_score_of_error(err: &PreprocessError) -> f64 {
    match err {
        PreprocessError::Rejected(_, metrics) => metrics.blur_score,
        other => panic!("expected a rejection, got {other:?}"),
    }
}

#[test]
fn clean_page_preprocesses_to_two_renditions() {
    let page = png_bytes(&text_page(1200, 1600, 0.0));
    let out = preprocess_page(&page).expect("clean page preprocesses");

    assert!(!out.grayscale_png.is_empty());
    assert!(!out.binarized_png.is_empty());

    // Both renditions decode and share the page's dimensions.
    let gray = image::load_from_memory(&out.grayscale_png).expect("grayscale decodes");
    let binary = image::load_from_memory(&out.binarized_png).expect("binary decodes");
    assert_eq!(gray.width(), binary.width());
    assert_eq!(gray.height(), binary.height());

    // There is ink, but the page is not drowning in it.
    assert!(out.metrics.ink_coverage > 0.0);
    assert!(out.metrics.ink_coverage < 0.85);
}

#[test]
fn heavily_blurred_page_is_rejected_as_blurry() {
    let sharp = text_page(1200, 1600, 0.0);
    let blurred = gaussian_blur_f32(&sharp, 6.0);

    let sharp_out = preprocess_page(&png_bytes(&sharp)).expect("sharp page preprocesses");
    let err = preprocess_page(&png_bytes(&blurred)).expect_err("blurred page is rejected");

    match err {
        PreprocessError::Rejected(RejectReason::Blurry, _) => {}
        other => panic!("expected Blurry, got {other:?}"),
    }
    // The blur measure orders the two pages the way a human would.
    assert!(blur_score_of_error(&err) < sharp_out.metrics.blur_score);
}

#[test]
fn dark_page_is_rejected_as_too_dark() {
    let dark = GrayImage::from_pixel(1000, 1400, Luma([12]));
    let err = preprocess_page(&png_bytes(&dark)).expect_err("dark page is rejected");
    match err {
        PreprocessError::Rejected(RejectReason::TooDark, _) => {}
        other => panic!("expected TooDark, got {other:?}"),
    }
}

#[test]
fn blank_page_is_rejected_as_blank() {
    let blank = GrayImage::from_pixel(1000, 1400, Luma([250]));
    let err = preprocess_page(&png_bytes(&blank)).expect_err("blank page is rejected");
    match err {
        PreprocessError::Rejected(RejectReason::Blank, _) => {}
        other => panic!("expected Blank, got {other:?}"),
    }
}

#[test]
fn skew_is_detected_near_the_induced_angle() {
    // A slope of 0.09 is about 5.1 degrees of tilt.
    let tilted = png_bytes(&text_page(1400, 1000, 0.09));
    let out = preprocess_page(&tilted).expect("tilted page still preprocesses");
    let detected = out.metrics.skew_angle_deg.abs();
    assert!(
        (3.0..=8.0).contains(&detected),
        "expected ~5 degrees of skew, detected {detected}"
    );
}

#[test]
fn oversized_page_is_downscaled_to_the_long_edge_budget() {
    let big = png_bytes(&text_page(3600, 2400, 0.0));
    let out = preprocess_page(&big).expect("large page preprocesses");
    assert!(out.metrics.width <= 2200 && out.metrics.height <= 2200);
    assert_eq!(out.metrics.width.max(out.metrics.height), 2200);
}

#[test]
fn undecodable_bytes_fail_with_a_decode_error() {
    let err = preprocess_page(b"not an image").expect_err("garbage is rejected");
    match err {
        PreprocessError::Decode(_) => {}
        other => panic!("expected Decode, got {other:?}"),
    }
}
