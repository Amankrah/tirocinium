//! Test preconditions for the pdfium suite.
//!
//! Two things have to be present before a fixture test can assert anything
//! real: the native pdfium library, which infra provisions rather than commits,
//! and the fixture PDF itself, which is tracked in Git LFS and is a short text
//! pointer until someone runs `git lfs pull`. Either one absent used to fail
//! differently: a missing library skipped cleanly, while an unfetched fixture
//! reached pdfium as a 132-byte pointer file and came back as an opaque
//! `FormatError`. Both are the same condition (the data is not here), so both
//! skip here, and both say which one it was.
//!
//! Skipping is honest only because CI provisions both, so these assertions do
//! run somewhere. A skip on a bare checkout keeps `cargo test` green without
//! pretending absent data was verified.

use std::path::Path;

/// Every Git LFS pointer file begins with this line (the v1 pointer spec).
const LFS_POINTER_PREFIX: &[u8] = b"version https://git-lfs.github.com/spec/v1";

/// Whether these bytes are an unfetched LFS pointer rather than the real file.
#[must_use]
pub fn is_lfs_pointer(bytes: &[u8]) -> bool {
    bytes.starts_with(LFS_POINTER_PREFIX)
}

/// The vendored pdfium binary for the current platform, if provisioned
/// (`infra/setup.sh`, or `TIRO_PDFIUM_LIB`).
#[must_use]
pub fn lib_path() -> Option<String> {
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

/// Both preconditions for a fixture test: the pdfium library path, or `None`
/// after reporting which precondition is missing. Pass every fixture the test
/// reads, so an unfetched one is named before pdfium ever sees it.
///
/// Call it as the test's first line:
/// ```ignore
/// let Some(lib) = testkit::ready(&[pdf]) else { return };
/// ```
#[must_use]
pub fn ready(fixtures: &[&[u8]]) -> Option<String> {
    if fixtures.iter().any(|bytes| is_lfs_pointer(bytes)) {
        eprintln!(
            "fixture is an unfetched Git LFS pointer; skipping \
             (run `git lfs install && git lfs pull`)"
        );
        return None;
    }
    let Some(lib) = lib_path() else {
        eprintln!("pdfium not provisioned; skipping (see pdf/corpus/README.md)");
        return None;
    };
    Some(lib)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_pointer_file_is_recognised_and_a_real_pdf_is_not() {
        let pointer = b"version https://git-lfs.github.com/spec/v1\noid sha256:ab\nsize 1039\n";
        assert!(is_lfs_pointer(pointer));
        assert!(!is_lfs_pointer(b"%PDF-1.7\n"));
        assert!(!is_lfs_pointer(b""));
    }
}
