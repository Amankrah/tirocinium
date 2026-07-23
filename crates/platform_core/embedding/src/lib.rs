//! The Tirocinium embedding quantizer (backend guide 3.3 "Embeddings
//! quantization" and section 4 Stage 4): symmetric int8 scalar quantization
//! with one `f32` scale per vector, and cosine similarity computed straight
//! from the quantized bytes. Pure functions of a vector in, no global state,
//! property-testable like the rest of `platform_core`.
//!
//! The embedding vector itself comes from an external provider through a
//! Python Protocol seam (decision 0020); this crate never produces embeddings,
//! only compresses their range into a byte per component so vector storage
//! costs a quarter of `f32` with negligible retrieval loss at this corpus
//! size.

#[cfg(feature = "python")]
pub mod python;

use std::fmt;

/// The signed-8-bit range the quantizer targets. Symmetric about zero, so the
/// most negative code `-128` is left unused and the scale maps the largest
/// absolute component onto `127`.
const I8_MAX: f32 = 127.0;

#[derive(Debug, PartialEq, Eq)]
pub struct EmbeddingError(pub String);

impl fmt::Display for EmbeddingError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "embedding: {}", self.0)
    }
}

impl std::error::Error for EmbeddingError {}

/// Symmetric int8 scalar quantization: one scale per vector, the largest
/// absolute component mapped onto `127`, every component rounded to the
/// nearest code and clamped into `[-127, 127]`. Returns the codes and the
/// scale needed to reconstruct them (`value approx code * scale`).
///
/// An all-zero vector quantizes to all-zero codes with a zero scale, which
/// round-trips exactly. The scale is always finite and non-negative.
///
/// # Errors
/// When the vector is empty (a zero-length embedding is a caller bug) or
/// carries a non-finite component (NaN or infinity is not a valid embedding).
pub fn quantize(vector: &[f32]) -> Result<(Vec<i8>, f32), EmbeddingError> {
    if vector.is_empty() {
        return Err(EmbeddingError("cannot quantize an empty vector".into()));
    }
    let mut max_abs = 0.0_f32;
    for &component in vector {
        if !component.is_finite() {
            return Err(EmbeddingError(format!(
                "vector has a non-finite component ({component})"
            )));
        }
        max_abs = max_abs.max(component.abs());
    }
    // `<= 0.0` rather than `== 0.0` keeps clippy's float_cmp quiet; abs values
    // are non-negative, so this branch is exactly the all-zero vector.
    if max_abs <= 0.0 {
        return Ok((vec![0_i8; vector.len()], 0.0));
    }
    let scale = max_abs / I8_MAX;
    let codes = vector
        .iter()
        .map(|&component| to_code(component / scale))
        .collect();
    Ok((codes, scale))
}

/// Round to the nearest int8 code and clamp into `[-127, 127]`. The clamp
/// bounds the value before the cast, so the truncation clippy warns about
/// cannot happen (the input is an integral `f32` in range).
#[allow(clippy::cast_possible_truncation)]
fn to_code(scaled: f32) -> i8 {
    scaled.round().clamp(-I8_MAX, I8_MAX) as i8
}

/// Reconstruct the approximate `f32` vector from its codes and scale, the
/// inverse of [`quantize`] up to the quantization step (at most `scale / 2`
/// per component).
#[must_use]
pub fn dequantize(codes: &[i8], scale: f32) -> Vec<f32> {
    codes.iter().map(|&code| f32::from(code) * scale).collect()
}

/// Cosine similarity of two vectors from their int8 codes alone. The
/// per-vector scales cancel in a cosine (numerator and denominator each carry
/// one factor of each scale), so similarity is computed without rehydrating to
/// `f32` and without needing the scales at all. A zero-magnitude vector has no
/// direction, so its similarity to anything is defined as `0.0`.
///
/// The result is accumulated in `f64` and clamped to `[-1, 1]` so rounding
/// never yields a value a caller would reject as out of range.
///
/// # Errors
/// When the two code vectors differ in length (they must come from the same
/// embedding model, hence the same dimensionality).
pub fn cosine_i8(a: &[i8], b: &[i8]) -> Result<f64, EmbeddingError> {
    if a.len() != b.len() {
        return Err(EmbeddingError(format!(
            "dimension mismatch: {} vs {}",
            a.len(),
            b.len()
        )));
    }
    let mut dot = 0.0_f64;
    let mut norm_a = 0.0_f64;
    let mut norm_b = 0.0_f64;
    for (&x, &y) in a.iter().zip(b.iter()) {
        let (x, y) = (f64::from(x), f64::from(y));
        dot += x * y;
        norm_a += x * x;
        norm_b += y * y;
    }
    if norm_a == 0.0 || norm_b == 0.0 {
        return Ok(0.0);
    }
    Ok((dot / (norm_a.sqrt() * norm_b.sqrt())).clamp(-1.0, 1.0))
}

#[cfg(test)]
mod tests {
    // Exact float comparisons in assertions are intentional here (endpoints,
    // the zero scale), so float_cmp is allowed across the test module only.
    #![allow(clippy::float_cmp)]
    use super::*;
    use proptest::prelude::*;

    fn cosine_f32(a: &[f32], b: &[f32]) -> f64 {
        let mut dot = 0.0_f64;
        let mut na = 0.0_f64;
        let mut nb = 0.0_f64;
        for (&x, &y) in a.iter().zip(b.iter()) {
            let (x, y) = (f64::from(x), f64::from(y));
            dot += x * y;
            na += x * x;
            nb += y * y;
        }
        if na == 0.0 || nb == 0.0 {
            return 0.0;
        }
        dot / (na.sqrt() * nb.sqrt())
    }

    #[test]
    fn empty_vector_is_rejected() {
        assert!(quantize(&[]).is_err());
    }

    #[test]
    fn non_finite_component_is_rejected() {
        assert!(quantize(&[1.0, f32::NAN, 2.0]).is_err());
        assert!(quantize(&[1.0, f32::INFINITY]).is_err());
    }

    #[test]
    fn all_zero_vector_round_trips_exactly() {
        let (codes, scale) = quantize(&[0.0, 0.0, 0.0]).expect("quantize");
        assert_eq!(codes, vec![0, 0, 0]);
        assert_eq!(scale, 0.0);
        assert_eq!(dequantize(&codes, scale), vec![0.0, 0.0, 0.0]);
    }

    #[test]
    fn largest_component_maps_onto_the_endpoint() {
        let (codes, _) = quantize(&[0.0, -4.0, 2.0]).expect("quantize");
        // -4.0 is the largest magnitude, so it lands on the negative endpoint.
        assert_eq!(codes[1], -127);
    }

    #[test]
    fn cosine_dimension_mismatch_is_an_error() {
        assert!(cosine_i8(&[1, 2, 3], &[1, 2]).is_err());
    }

    #[test]
    fn cosine_with_a_zero_vector_is_zero() {
        assert_eq!(cosine_i8(&[0, 0, 0], &[1, 2, 3]).expect("cosine"), 0.0);
    }

    #[test]
    fn identical_direction_is_similarity_one() {
        let (codes, _) = quantize(&[1.0, 2.0, 3.0, 4.0]).expect("quantize");
        let sim = cosine_i8(&codes, &codes).expect("cosine");
        assert!((sim - 1.0).abs() < 1e-9, "self-similarity was {sim}");
    }

    proptest! {
        // Quantize then dequantize stays within one quantization step per
        // component (the defining accuracy guarantee of scalar quantization).
        #[test]
        fn round_trip_within_one_step(
            vector in prop::collection::vec(-100.0_f32..100.0, 1..64)
        ) {
            let (codes, scale) = quantize(&vector).expect("quantize");
            let restored = dequantize(&codes, scale);
            for (&original, &back) in vector.iter().zip(restored.iter()) {
                prop_assert!((original - back).abs() <= scale + 1e-4);
            }
        }

        // The scale is always finite and non-negative.
        #[test]
        fn scale_is_non_negative(
            vector in prop::collection::vec(-1000.0_f32..1000.0, 1..64)
        ) {
            let (_, scale) = quantize(&vector).expect("quantize");
            prop_assert!(scale >= 0.0 && scale.is_finite());
        }

        // Cosine over the int8 codes tracks the float cosine: quantization
        // perturbs each component by at most half a step, so the direction,
        // and therefore the cosine, moves only a little. A loose bound proves
        // ordering is preserved without pinning the exact error.
        #[test]
        fn cosine_tracks_float_cosine(
            a in prop::collection::vec(-10.0_f32..10.0, 8..32),
            b in prop::collection::vec(-10.0_f32..10.0, 8..32),
        ) {
            let n = a.len().min(b.len());
            let (a, b) = (&a[..n], &b[..n]);
            let (qa, _) = quantize(a).expect("quantize a");
            let (qb, _) = quantize(b).expect("quantize b");
            let quantized = cosine_i8(&qa, &qb).expect("cosine");
            let exact = cosine_f32(a, b);
            prop_assert!((quantized - exact).abs() < 0.05,
                "quantized {quantized} vs exact {exact}");
        }
    }
}
