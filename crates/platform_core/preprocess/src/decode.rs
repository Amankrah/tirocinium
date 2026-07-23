//! Decode camera bytes into an upright image. Phones almost never rotate the
//! sensor pixels; they record the orientation as an EXIF tag and leave the
//! bytes as the sensor saw them, so a page photographed in portrait arrives
//! sideways unless we read the tag and apply it ourselves. `image` does not
//! honour EXIF on load, hence this module.

use image::DynamicImage;

use crate::PreprocessError;

/// Decode `bytes` and apply the EXIF orientation so the result is upright.
///
/// HEIC is accepted at upload but is not decodable by the pure-Rust `image`
/// crate; such bytes fail here with a decode error and are transcoded
/// upstream before reaching preprocessing (recorded in decision 0016).
pub fn decode_oriented(bytes: &[u8]) -> Result<DynamicImage, PreprocessError> {
    let image =
        image::load_from_memory(bytes).map_err(|e| PreprocessError::Decode(e.to_string()))?;
    Ok(apply_orientation(image, read_orientation(bytes)))
}

/// Read the EXIF orientation tag (1..8), defaulting to 1 (upright) when there
/// is no EXIF block or the tag is absent, which is the correct default for
/// PNG and for JPEGs a phone already rotated.
fn read_orientation(bytes: &[u8]) -> u32 {
    let mut cursor = std::io::Cursor::new(bytes);
    exif::Reader::new()
        .read_from_container(&mut cursor)
        .ok()
        .and_then(|exif| {
            exif.get_field(exif::Tag::Orientation, exif::In::PRIMARY)
                .and_then(|field| field.value.get_uint(0))
        })
        .unwrap_or(1)
}

/// Apply the eight EXIF orientations. The transposed cases (5 and 7) combine
/// a rotation with a mirror; the rest are a single rotation or mirror.
fn apply_orientation(image: DynamicImage, orientation: u32) -> DynamicImage {
    match orientation {
        2 => image.fliph(),
        3 => image.rotate180(),
        4 => image.flipv(),
        5 => image.rotate90().fliph(),
        6 => image.rotate90(),
        7 => image.rotate270().fliph(),
        8 => image.rotate270(),
        _ => image,
    }
}
