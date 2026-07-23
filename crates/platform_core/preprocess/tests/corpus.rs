//! Golden-file gate over the real handwriting corpus (backend guide section
//! 4; Phase 3.2 gate: "golden-file suite green with preprocessing outputs
//! within perceptual-hash tolerance"). Each corpus photo has a recorded
//! expectation in `corpus/expectations.json`: either the rejection reason it
//! must produce, or, for a readable page, the perceptual hash (dHash) of its
//! grayscale rendition and a Hamming-distance tolerance. The hash absorbs the
//! bit-level nondeterminism of resampling and rounding while still catching a
//! real change in the pipeline's output.
//!
//! The corpus is a deliberately grown project asset (docs/decisions/0016). It
//! is empty until the 30 photos are captured; until then this test is a
//! no-op that documents itself, so the gate stays green without pretending to
//! verify data that does not exist. Once photos land under `corpus/images/`,
//! record the baseline with `TIRO_RECORD=1 cargo test -p tirocinium-preprocess
//! --test corpus` and review the written `expectations.json` before committing.

use std::path::{Path, PathBuf};

use image::GrayImage;
use serde_json::{json, Map, Value};
use tirocinium_preprocess::{preprocess_page, PreprocessError};

fn corpus_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("corpus")
}

/// Perceptual difference hash: shrink the grayscale rendition to 9x8 and set
/// one bit per adjacent-pixel comparison, giving a 64-bit fingerprint stable
/// under small resampling differences.
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

fn corpus_images() -> Vec<PathBuf> {
    let images = corpus_dir().join("images");
    let Ok(entries) = std::fs::read_dir(&images) else {
        return Vec::new();
    };
    let mut paths: Vec<PathBuf> = entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| {
            matches!(
                p.extension()
                    .and_then(|e| e.to_str())
                    .map(str::to_ascii_lowercase)
                    .as_deref(),
                Some("jpg" | "jpeg" | "png" | "heic" | "webp")
            )
        })
        .collect();
    paths.sort();
    paths
}

#[test]
fn golden_corpus_matches_expectations() {
    let images = corpus_images();
    if images.is_empty() {
        eprintln!(
            "preprocess corpus is empty; golden gate is a no-op until the 30-photo \
             asset lands (see crates/platform_core/preprocess/corpus/README.md)"
        );
        return;
    }

    let recording = std::env::var_os("TIRO_RECORD").is_some();
    let expectations_path = corpus_dir().join("expectations.json");
    let expectations: Value = std::fs::read_to_string(&expectations_path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_else(|| json!({}));
    let mut recorded = Map::new();

    for path in images {
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap()
            .to_string();
        let bytes = std::fs::read(&path).expect("read corpus image");

        match preprocess_page(&bytes) {
            Ok(out) => {
                let gray = image::load_from_memory(&out.grayscale_png)
                    .expect("grayscale decodes")
                    .to_luma8();
                let hash = dhash(&gray);
                if recording {
                    recorded.insert(
                        name,
                        json!({ "accept": { "dhash": hash, "max_distance": 6 } }),
                    );
                } else {
                    let accept = expectations
                        .get(&name)
                        .and_then(|e| e.get("accept"))
                        .unwrap_or_else(|| panic!("{name}: no accept expectation recorded"));
                    let want = accept["dhash"].as_u64().expect("dhash");
                    let tolerance = accept["max_distance"].as_u64().expect("max_distance");
                    let distance = u64::from((hash ^ want).count_ones());
                    assert!(
                        distance <= tolerance,
                        "{name}: perceptual-hash distance {distance} exceeds tolerance {tolerance}"
                    );
                }
            }
            Err(PreprocessError::Rejected(reason, _)) => {
                if recording {
                    recorded.insert(name, json!({ "reject": reason.code() }));
                } else {
                    let want = expectations
                        .get(&name)
                        .and_then(|e| e.get("reject"))
                        .unwrap_or_else(|| panic!("{name}: no reject expectation recorded"));
                    assert_eq!(want, reason.code(), "{name}: wrong rejection reason");
                }
            }
            Err(other) => panic!("{name}: unexpected error {other}"),
        }
    }

    if recording {
        let text = serde_json::to_string_pretty(&Value::Object(recorded)).expect("serialize");
        std::fs::write(&expectations_path, text).expect("write expectations.json");
        eprintln!("recorded expectations to {}", expectations_path.display());
    }
}
