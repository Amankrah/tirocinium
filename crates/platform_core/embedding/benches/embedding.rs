//! Criterion benchmarks for the embedding quantizer's public functions, gated
//! by the absolute budgets in crates/platform_core/bench-thresholds.json
//! (decision 0004). Sized at 1536 dimensions, the `text-embedding-3-small`
//! width the retrieval seam uses (decision 0020).

use criterion::{black_box, criterion_group, criterion_main, Criterion};
use tirocinium_embedding::{cosine_i8, quantize};

const DIM: usize = 1536;

#[allow(clippy::cast_precision_loss)] // the modulo keeps the value in [0, 2000), exact in f32
fn sample_vector(seed: usize) -> Vec<f32> {
    // A deterministic spread of components, no RNG dependency in a bench.
    (0..DIM)
        .map(|i| ((i.wrapping_mul(2_654_435_761).wrapping_add(seed)) % 2000) as f32 / 1000.0 - 1.0)
        .collect()
}

fn benches(c: &mut Criterion) {
    let vector = sample_vector(1);
    let (a, _) = quantize(&vector).expect("quantize");
    let (b, _) = quantize(&sample_vector(7)).expect("quantize");

    c.bench_function("embedding_quantize_1536", |bencher| {
        bencher.iter(|| black_box(quantize(black_box(&vector))));
    });

    c.bench_function("embedding_cosine_i8_1536", |bencher| {
        bencher.iter(|| black_box(cosine_i8(black_box(&a), black_box(&b))));
    });
}

criterion_group!(embedding_benches, benches);
criterion_main!(embedding_benches);
