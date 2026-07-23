//! Executable properties of the codec (milestone 1.2): roundtrip fidelity
//! with and without a dictionary, dictionaries help on corpus-like text,
//! wrong dictionaries fail loudly, and levels are validated.

use proptest::prelude::*;
use tirocinium_codec::{compress, decompress, train_dictionary, DEFAULT_LEVEL};

/// A synthetic corpus with the shared-vocabulary shape of case study text.
fn corpus(seed: &str, n: usize) -> Vec<Vec<u8>> {
    (0..n)
        .map(|i| {
            format!(
                "Case study {i}: {seed}. The discount rate is {}.{:02} percent \
                 and the cashflow horizon is {} years. Compute the net present \
                 value and state whether the project should proceed.",
                4 + i % 8,
                i % 100,
                4 + i % 5,
            )
            .into_bytes()
        })
        .collect()
}

fn trained(seed: &str) -> Vec<u8> {
    train_dictionary(&corpus(seed, 200), 16 * 1024).expect("training succeeds")
}

proptest! {
    #[test]
    fn roundtrip_plain(data in proptest::collection::vec(any::<u8>(), 0..4096)) {
        let z = compress(&data, None, None).unwrap();
        prop_assert_eq!(decompress(&z, None).unwrap(), data);
    }

    #[test]
    fn roundtrip_with_dictionary(data in proptest::collection::vec(any::<u8>(), 0..4096)) {
        let dict = trained("npv");
        let z = compress(&data, Some(&dict), None).unwrap();
        prop_assert_eq!(decompress(&z, Some(&dict)).unwrap(), data);
    }

    #[test]
    fn levels_above_range_error(level in 23i32..1000) {
        // zstd's supported range includes negative "fast" levels, so only
        // the upper bound is a hard error.
        prop_assert!(compress(b"x", None, Some(level)).is_err());
    }
}

#[test]
fn dictionary_beats_plain_on_corpus_text() {
    let dict = trained("npv");
    let sample = &corpus("npv", 300)[250];
    let with_dict = compress(sample, Some(&dict), None).unwrap();
    let plain = compress(sample, None, None).unwrap();
    assert!(
        with_dict.len() < plain.len(),
        "dictionary {} >= plain {}",
        with_dict.len(),
        plain.len()
    );
}

#[test]
fn plain_frame_decompresses_even_when_a_dictionary_is_supplied() {
    // Blobs compressed before a course's dictionary was trained must stay
    // readable afterwards: a frame that never referenced a dictionary
    // ignores the one supplied.
    let z = compress(b"written before training", None, None).unwrap();
    let dict = trained("npv");
    assert_eq!(
        decompress(&z, Some(&dict)).unwrap(),
        b"written before training"
    );
}

#[test]
fn wrong_dictionary_fails_loudly() {
    let dict_a = trained("net present value of agri-processing cashflows");
    let dict_b = trained("second moment of inertia of the beam section");
    let z = compress(b"some course content", Some(&dict_a), None).unwrap();
    assert!(decompress(&z, Some(&dict_b)).is_err());
    assert!(decompress(&z, None).is_err());
}

#[test]
fn default_level_is_the_guides_seven() {
    assert_eq!(DEFAULT_LEVEL, 7);
}

#[test]
fn training_needs_a_real_corpus() {
    assert!(train_dictionary(&[], 16 * 1024).is_err());
}
