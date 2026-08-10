//! Golden-file gate over the real PDF corpus (backend guide section 5; the
//! Phase 4 gate: "a committed corpus of five real problem-set PDFs ... round-
//! trips with every figure byte-identical or hash-stable and positioned at its
//! token"). Each PDF has a recorded expectation in `corpus/expectations.json`:
//! per page its classification (born-digital vs scanned) and, for born-digital
//! pages, a content fingerprint of the extracted text; per figure its source and
//! a fidelity fingerprint, byte-identical for an embedded raster (an FNV-1a of
//! the extracted bytes plus their length, which any single-byte change flips)
//! and hash-stable for a rendered vector region (a perceptual dHash of the
//! rendition with a Hamming tolerance, absorbing the bit-level nondeterminism of
//! pdfium's rasteriser while still catching a real change), plus its bbox within
//! a small tolerance. Token positioning is asserted on the Python side, where
//! `_place_tokens` puts the `fig://` token in the markdown (see
//! `apps/api/app/imports/test_figures.py`); this crate owns the byte round-trip.
//!
//! The corpus is a deliberately grown project asset (docs/decisions/0033). It is
//! empty until the five PDFs are captured; until then this test is a self-
//! documenting no-op, so the gate stays green without pretending to verify data
//! that does not exist. When present, decode and figure extraction need the
//! vendored pdfium binary (`vendor/bin/pdfium.dll`), which infra provisions; the
//! test skips when it is absent, exactly as the crate's other native tests do,
//! so the gate is real wherever pdfium is provisioned (CI) and a bare checkout
//! stays green. Once the PDFs land under `corpus/pdfs/`, record the baseline with
//! `TIRO_RECORD=1 cargo test -p tirocinium-pdf --test corpus` and review the
//! written `expectations.json` before committing (see `corpus/README.md`).

use std::path::{Path, PathBuf};

use image::GrayImage;
use serde_json::{json, Map, Value};
use tirocinium_pdf::{decode, extract_figures, FigureSource, PageKind};

/// The render width used to decode corpus pages, matching the worker's default
/// (`platform_core.pdf.decode`'s 1654 px, about 200 dpi on A4). The page raster
/// is not itself hashed here; this only fixes classification and text extraction.
const RENDER_WIDTH: i32 = 1654;

/// Points of slack allowed on each bbox component: extraction is deterministic,
/// but a tenth of a point of rounding should not fail the gate.
const BBOX_TOL_PTS: f64 = 1.0;

/// Hamming tolerance on a rendered region's perceptual hash, and the pixel slack
/// on its dimensions: pdfium's rasteriser wobbles a bit across builds/platforms
/// the way the preprocess corpus's grayscale renditions do.
const VECTOR_DHASH_MAX_DISTANCE: u64 = 6;
const VECTOR_DIM_TOL: i64 = 2;

fn corpus_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("corpus")
}

fn corpus_pdfs() -> Vec<PathBuf> {
    let dir = corpus_dir().join("pdfs");
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return Vec::new();
    };
    let mut paths: Vec<PathBuf> = entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().and_then(|e| e.to_str()) == Some("pdf"))
        .collect();
    paths.sort();
    paths
}

/// The vendored pdfium binary for the current platform, if provisioned
/// (`infra/setup.sh`, or `TIRO_PDFIUM_LIB`). Absent on a bare checkout, so the
/// gate skips rather than fails there.
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

/// FNV-1a over bytes: a compact, dependency-free content fingerprint. Not a
/// cryptographic hash, but any single-byte change flips it, which is all a
/// regression gate needs; the recorded byte length is checked alongside it.
fn fnv1a(bytes: &[u8]) -> u64 {
    let mut hash = 0xcbf2_9ce4_8422_2325_u64;
    for &b in bytes {
        hash ^= u64::from(b);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    hash
}

/// Perceptual difference hash: shrink the grayscale rendition to 9x8 and set one
/// bit per adjacent-pixel comparison, a 64-bit fingerprint stable under small
/// resampling differences (the same hash the preprocess corpus uses).
fn dhash(gray: &GrayImage) -> u64 {
    let small = image::imageops::resize(gray, 9, 8, image::imageops::FilterType::Triangle);
    let mut hash = 0u64;
    let mut bit = 0u32;
    for y in 0..8u32 {
        for x in 0..8u32 {
            if small.get_pixel(x, y)[0] < small.get_pixel(x + 1, y)[0] {
                hash |= 1 << bit;
            }
            bit += 1;
        }
    }
    hash
}

fn normalize_text(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn bbox_json(bbox: [f32; 4]) -> Value {
    json!([
        f64::from(bbox[0]),
        f64::from(bbox[1]),
        f64::from(bbox[2]),
        f64::from(bbox[3]),
    ])
}

/// Decode and extract one PDF into the recordable fingerprint of its pages and
/// figures. This is the single computation path: record serialises it, assert
/// recomputes it and compares against the stored expectation.
fn fingerprint(lib: &str, bytes: &[u8]) -> Value {
    let pages = decode(lib, bytes, RENDER_WIDTH).expect("decode corpus pdf");
    let page_values: Vec<Value> = pages
        .iter()
        .map(|page| match page.kind {
            PageKind::BornDigital => {
                let text = normalize_text(page.text_markdown.as_deref().unwrap_or(""));
                json!({
                    "kind": PageKind::BornDigital.as_str(),
                    "text_fnv1a": fnv1a(text.as_bytes()),
                    "text_chars": text.chars().count(),
                })
            }
            PageKind::Scanned => json!({ "kind": PageKind::Scanned.as_str() }),
        })
        .collect();

    let mut figure_values: Vec<Value> = Vec::new();
    for index in 0..pages.len() {
        let page_index = u16::try_from(index).expect("corpus page index fits u16");
        let page = extract_figures(lib, bytes, page_index).expect("extract corpus figures");
        for figure in page.figures {
            let mut value = json!({
                "page": index,
                "source": figure.source.as_str(),
                "width_px": figure.width_px,
                "height_px": figure.height_px,
                "bbox": bbox_json(figure.bbox),
            });
            let object = value.as_object_mut().expect("figure object");
            match figure.source {
                FigureSource::VectorRender => {
                    let gray = image::load_from_memory(&figure.image)
                        .expect("figure rendition decodes")
                        .to_luma8();
                    object.insert("dhash".into(), json!(dhash(&gray)));
                    object.insert("max_distance".into(), json!(VECTOR_DHASH_MAX_DISTANCE));
                }
                FigureSource::EmbeddedRaster | FigureSource::PageCrop => {
                    object.insert("content_fnv1a".into(), json!(fnv1a(&figure.image)));
                    object.insert("bytes_len".into(), json!(figure.image.len()));
                }
            }
            figure_values.push(value);
        }
    }

    json!({ "pages": page_values, "figures": figure_values })
}

fn u64_at(value: &Value, key: &str) -> u64 {
    value[key]
        .as_u64()
        .unwrap_or_else(|| panic!("missing u64 {key}"))
}

fn bbox_at(value: &Value) -> [f64; 4] {
    let array = value["bbox"].as_array().expect("bbox array");
    assert_eq!(array.len(), 4, "bbox has four components");
    let mut out = [0f64; 4];
    for (slot, component) in out.iter_mut().zip(array) {
        *slot = component.as_f64().expect("bbox component");
    }
    out
}

fn assert_pages(name: &str, expected: &Value, actual: &Value) {
    let expected_pages = expected["pages"].as_array().expect("expected pages");
    let actual_pages = actual["pages"].as_array().expect("actual pages");
    assert_eq!(
        expected_pages.len(),
        actual_pages.len(),
        "{name}: page count changed"
    );
    for (index, (want, got)) in expected_pages.iter().zip(actual_pages).enumerate() {
        assert_eq!(
            want["kind"], got["kind"],
            "{name}: page {index} classification changed"
        );
        if want["kind"] == json!(PageKind::BornDigital.as_str()) {
            assert_eq!(
                u64_at(want, "text_fnv1a"),
                u64_at(got, "text_fnv1a"),
                "{name}: page {index} extracted text changed"
            );
            assert_eq!(
                u64_at(want, "text_chars"),
                u64_at(got, "text_chars"),
                "{name}: page {index} text length changed"
            );
        }
    }
}

fn assert_figures(name: &str, expected: &Value, actual: &Value) {
    let expected_figures = expected["figures"].as_array().expect("expected figures");
    let actual_figures = actual["figures"].as_array().expect("actual figures");
    assert_eq!(
        expected_figures.len(),
        actual_figures.len(),
        "{name}: figure count changed"
    );
    for (index, (want, got)) in expected_figures.iter().zip(actual_figures).enumerate() {
        let label = format!("{name}: figure {index}");
        assert_eq!(want["page"], got["page"], "{label}: source page changed");
        assert_eq!(
            want["source"], got["source"],
            "{label}: source kind changed"
        );

        let (want_box, got_box) = (bbox_at(want), bbox_at(got));
        for (axis, (w, g)) in want_box.iter().zip(&got_box).enumerate() {
            assert!(
                (w - g).abs() <= BBOX_TOL_PTS,
                "{label}: bbox[{axis}] moved from {w} to {g}"
            );
        }

        if want["source"] == json!(FigureSource::VectorRender.as_str()) {
            let distance = u64::from((u64_at(want, "dhash") ^ u64_at(got, "dhash")).count_ones());
            let tolerance = u64_at(want, "max_distance");
            assert!(
                distance <= tolerance,
                "{label}: rendered region perceptual-hash distance {distance} exceeds {tolerance}"
            );
            let dim_gap = |a: u64, b: u64| i64::try_from(a).unwrap() - i64::try_from(b).unwrap();
            assert!(
                dim_gap(u64_at(want, "width_px"), u64_at(got, "width_px")).abs() <= VECTOR_DIM_TOL,
                "{label}: rendered width changed beyond tolerance"
            );
            assert!(
                dim_gap(u64_at(want, "height_px"), u64_at(got, "height_px")).abs()
                    <= VECTOR_DIM_TOL,
                "{label}: rendered height changed beyond tolerance"
            );
        } else {
            // Byte-identical: the professor's pixels, unchanged.
            assert_eq!(
                u64_at(want, "content_fnv1a"),
                u64_at(got, "content_fnv1a"),
                "{label}: extracted bytes changed (no longer byte-identical)"
            );
            assert_eq!(
                u64_at(want, "bytes_len"),
                u64_at(got, "bytes_len"),
                "{label}: extracted byte length changed"
            );
            assert_eq!(
                u64_at(want, "width_px"),
                u64_at(got, "width_px"),
                "{label}: pixel width changed"
            );
            assert_eq!(
                u64_at(want, "height_px"),
                u64_at(got, "height_px"),
                "{label}: pixel height changed"
            );
        }
    }
}

#[test]
fn golden_corpus_round_trips() {
    let pdfs = corpus_pdfs();
    if pdfs.is_empty() {
        eprintln!(
            "pdf corpus is empty; golden gate is a no-op until the five-PDF asset \
             lands (see crates/platform_core/pdf/corpus/README.md)"
        );
        return;
    }
    let Some(lib) = lib_path() else {
        eprintln!("pdfium not provisioned; skipping corpus gate (see pdf/corpus/README.md)");
        return;
    };

    let recording = std::env::var_os("TIRO_RECORD").is_some();
    let expectations_path = corpus_dir().join("expectations.json");
    let expectations: Value = std::fs::read_to_string(&expectations_path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_else(|| json!({}));
    let mut recorded = Map::new();

    for path in pdfs {
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap()
            .to_string();
        let bytes = std::fs::read(&path).expect("read corpus pdf");
        if tirocinium_pdf::testkit::is_lfs_pointer(&bytes) {
            eprintln!(
                "{name}: corpus PDF is an unfetched Git LFS pointer; skipping corpus gate \
                 (run `git lfs install && git lfs pull`)"
            );
            return;
        }
        let actual = fingerprint(&lib, &bytes);

        if recording {
            recorded.insert(name, actual);
        } else {
            let expected = expectations.get(&name).unwrap_or_else(|| {
                panic!("{name}: no expectation recorded; run with TIRO_RECORD=1")
            });
            assert_pages(&name, expected, &actual);
            assert_figures(&name, expected, &actual);
        }
    }

    if recording {
        let text = serde_json::to_string_pretty(&Value::Object(recorded)).expect("serialize");
        std::fs::write(&expectations_path, text).expect("write expectations.json");
        eprintln!("recorded expectations to {}", expectations_path.display());
    }
}
