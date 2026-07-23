//! The Tirocinium compression codec (backend guide 3.3): zstd with trained
//! per-content-type dictionaries, as pure functions of bytes in, bytes out.
//! Dictionary identity and storage are the caller's concern (dictionaries
//! live in course shards); this crate never holds global state, which is
//! what keeps it property-testable like the rest of `platform_core`.

#[cfg(feature = "python")]
pub mod python;

use std::fmt;

/// The guide's chosen compression level for blob columns (backend 3.3).
pub const DEFAULT_LEVEL: i32 = 7;

/// Decompressed sizes are validated against this ceiling before allocation;
/// a frame claiming more is corrupt or hostile, not course content.
const MAX_DECOMPRESSED_SIZE: u64 = 256 * 1024 * 1024;

#[derive(Debug, PartialEq, Eq)]
pub struct CodecError(pub String);

impl fmt::Display for CodecError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "codec: {}", self.0)
    }
}

impl std::error::Error for CodecError {}

fn err(context: &str, e: impl fmt::Display) -> CodecError {
    CodecError(format!("{context}: {e}"))
}

/// Train a zstd dictionary on a sample corpus. `capacity` bounds the
/// dictionary size in bytes; the guide's per-content-type dictionaries are
/// trained once on an initial corpus and stored in the shard.
///
/// # Errors
/// When the corpus is empty or too small for zstd's trainer.
pub fn train_dictionary(samples: &[Vec<u8>], capacity: usize) -> Result<Vec<u8>, CodecError> {
    if samples.is_empty() {
        return Err(CodecError("training corpus is empty".into()));
    }
    zstd::dict::from_samples(samples, capacity).map_err(|e| err("dictionary training", e))
}

/// Compress with an optional trained dictionary. `level` defaults to
/// [`DEFAULT_LEVEL`]; out-of-range levels are an error, not a clamp.
///
/// # Errors
/// On an invalid level or an internal zstd failure.
pub fn compress(
    data: &[u8],
    dictionary: Option<&[u8]>,
    level: Option<i32>,
) -> Result<Vec<u8>, CodecError> {
    let level = level.unwrap_or(DEFAULT_LEVEL);
    let range = zstd::compression_level_range();
    if !range.contains(&level) {
        return Err(CodecError(format!(
            "level {level} outside supported range {}..={}",
            range.start(),
            range.end()
        )));
    }
    match dictionary {
        Some(dict) => zstd::bulk::Compressor::with_dictionary(level, dict)
            .and_then(|mut c| c.compress(data))
            .map_err(|e| err("compress with dictionary", e)),
        None => zstd::bulk::compress(data, level).map_err(|e| err("compress", e)),
    }
}

/// Decompress with an optional dictionary. A frame that never referenced a
/// dictionary decompresses fine with one supplied (blobs written before a
/// course's dictionary was trained stay readable); a frame written with a
/// different dictionary fails loudly.
///
/// # Errors
/// On corrupt input, an unknown or oversized declared size, or a
/// dictionary mismatch.
pub fn decompress(data: &[u8], dictionary: Option<&[u8]>) -> Result<Vec<u8>, CodecError> {
    let declared = zstd::zstd_safe::get_frame_content_size(data)
        .map_err(|e| err("frame header", e))?
        .ok_or_else(|| CodecError("frame does not declare its content size".into()))?;
    if declared > MAX_DECOMPRESSED_SIZE {
        return Err(CodecError(format!(
            "declared size {declared} exceeds the {MAX_DECOMPRESSED_SIZE} byte ceiling"
        )));
    }
    let capacity = usize::try_from(declared).map_err(|e| err("declared size", e))?;
    let mut d = match dictionary {
        Some(dict) => zstd::bulk::Decompressor::with_dictionary(dict)
            .map_err(|e| err("load dictionary", e))?,
        None => zstd::bulk::Decompressor::new().map_err(|e| err("decompressor", e))?,
    };
    d.decompress(data, capacity)
        .map_err(|e| err("decompress", e))
}
