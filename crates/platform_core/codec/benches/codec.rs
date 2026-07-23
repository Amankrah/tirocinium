//! Criterion benchmarks for the codec's public functions, gated by the
//! absolute budgets in crates/platform_core/bench-thresholds.json
//! (decision 0004). Flat ids map one to one onto criterion's output
//! directories.

use criterion::{black_box, criterion_group, criterion_main, Criterion};
use tirocinium_codec::{compress, decompress, train_dictionary};

/// Corpus-shaped text: a 4 KiB body with the shared vocabulary of case
/// study markdown, the size class of a typical compressed blob column.
#[allow(clippy::format_collect)] // corpus-shaped fixture text, clarity over the collect idiom
fn body() -> Vec<u8> {
    (0..16)
        .map(|i| {
            format!(
                "## Part {i}\n\nThe firm's discount rate is {}.{} percent and the \
                 cashflow horizon is {} years. Compute the net present value of \
                 the expansion and state whether the project should proceed. \
                 Show the discounting step by step and name the assumption that \
                 most affects the sign of your answer.\n\n",
                4 + i % 8,
                i % 10,
                4 + i % 5,
            )
        })
        .collect::<String>()
        .into_bytes()
}

fn samples() -> Vec<Vec<u8>> {
    (0..200)
        .map(|i| {
            format!(
                "Case study {i}: the discount rate is {}.{:02} percent over {} \
                 years of cashflows; compute the net present value.",
                4 + i % 8,
                i % 100,
                4 + i % 5,
            )
            .into_bytes()
        })
        .collect()
}

fn benches(c: &mut Criterion) {
    let text = body();
    let dict = train_dictionary(&samples(), 16 * 1024).expect("training succeeds");
    let z_plain = compress(&text, None, None).expect("compress");
    let z_dict = compress(&text, Some(&dict), None).expect("compress with dict");

    c.bench_function("codec_compress_4k_plain", |b| {
        b.iter(|| black_box(compress(black_box(&text), None, None)));
    });

    c.bench_function("codec_compress_4k_dict", |b| {
        b.iter(|| black_box(compress(black_box(&text), Some(&dict), None)));
    });

    c.bench_function("codec_decompress_4k_plain", |b| {
        b.iter(|| black_box(decompress(black_box(&z_plain), None)));
    });

    c.bench_function("codec_decompress_4k_dict", |b| {
        b.iter(|| black_box(decompress(black_box(&z_dict), Some(&dict))));
    });

    c.bench_function("codec_train_dictionary_200_samples", |b| {
        let corpus = samples();
        b.iter(|| black_box(train_dictionary(black_box(&corpus), 16 * 1024)));
    });
}

criterion_group!(codec_benches, benches);
criterion_main!(codec_benches);
