//! Latency budget gate (decision 0004): the guide holds p95 preprocessing
//! under two seconds for a 300 dpi A4 page (backend guide section 2). This
//! bench runs the whole pipeline on a full-size synthetic page so a
//! regression that blows the budget shows up here before the corpus gate.

use std::io::Cursor;

use criterion::{criterion_group, criterion_main, Criterion};
use image::{DynamicImage, ImageFormat, Rgb, RgbImage};

/// A full-size (about 300 dpi A4) synthetic page: white paper with rows of
/// dark strokes standing in for handwriting, encoded as PNG bytes.
fn synthetic_page_png() -> Vec<u8> {
    let (w, h) = (2480u32, 3508u32);
    let mut img = RgbImage::from_pixel(w, h, Rgb([245, 245, 240]));
    for row in 0..40u32 {
        let y0 = 120 + row * 80;
        for stroke in 0..30u32 {
            let x0 = 80 + stroke * 78;
            for dy in 0..6u32 {
                for dx in 0..60u32 {
                    let x = x0 + dx;
                    let y = y0 + dy + (dx / 12);
                    if x < w && y < h {
                        img.put_pixel(x, y, Rgb([25, 25, 30]));
                    }
                }
            }
        }
    }
    let mut buf = Cursor::new(Vec::new());
    DynamicImage::ImageRgb8(img)
        .write_to(&mut buf, ImageFormat::Png)
        .expect("encode synthetic page");
    buf.into_inner()
}

fn bench_preprocess(c: &mut Criterion) {
    let page = synthetic_page_png();
    c.bench_function("preprocess_page_a4", |b| {
        b.iter(|| tirocinium_preprocess::preprocess_page(&page).expect("page preprocesses"));
    });
}

criterion_group!(benches, bench_preprocess);
criterion_main!(benches);
