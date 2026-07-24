//! Golden-file gate over the real PDF corpus (backend guide section 5; the
//! Phase 4 gate: "a committed corpus of five real problem-set PDFs ... round-
//! trips with every figure byte-identical or hash-stable and positioned at its
//! token"). The figure-level assertions land with figure extraction (4.2); at
//! milestone 4.1 (decode) the corpus is exercised for page classification and
//! text extraction only.
//!
//! The corpus is a deliberately grown project asset. It is empty until the five
//! PDFs are captured; until then this test is a self-documenting no-op, so the
//! gate stays green without pretending to verify data that does not exist. The
//! decode path also needs the vendored pdfium binary
//! (`vendor/bin/pdfium.dll`), which infra provisions; the no-op needs neither.

use std::path::{Path, PathBuf};

fn corpus_pdfs() -> Vec<PathBuf> {
    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("corpus/pdfs");
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

#[test]
fn golden_corpus_decodes() {
    let pdfs = corpus_pdfs();
    if pdfs.is_empty() {
        eprintln!(
            "pdf corpus is empty; golden gate is a no-op until the five-PDF asset \
             lands (see crates/platform_core/pdf/corpus/README.md)"
        );
        return;
    }
    // When the corpus lands: decode each PDF against its recorded page-level
    // expectations (classification and text), extended to figure fidelity in
    // 4.2. Left unimplemented deliberately so the empty-corpus gate is honest.
    panic!(
        "pdf corpus has {} file(s) but the round-trip assertions are not yet \
         implemented; they arrive with milestone 4.2 (figure extraction)",
        pdfs.len()
    );
}
