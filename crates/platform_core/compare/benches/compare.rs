//! Criterion benches for the comparer's public functions, budget-gated like
//! every member (decision 0004; budgets in bench-thresholds.json).

use criterion::{criterion_group, criterion_main, Criterion};
use std::hint::black_box;
use tirocinium_compare::{compare_answer_lists, parse_numbers};

fn realistic_lists() -> (Vec<String>, Vec<String>) {
    let a = vec![
        "NPV = 1,234.56 EUR".to_string(),
        "IRR = 8.7%".to_string(),
        "Payback in 4.2 years, so accept the project".to_string(),
    ];
    let b = vec![
        "The NPV is 1234.6 EUR".to_string(),
        "8.7%".to_string(),
        "4.2 years to payback; accept the project".to_string(),
    ];
    (a, b)
}

fn bench_compare(c: &mut Criterion) {
    let (a, b) = realistic_lists();
    c.bench_function("compare_answer_lists_3", |bench| {
        bench.iter(|| compare_answer_lists(black_box(&a), black_box(&b), 5e-3, 1e-9));
    });
    c.bench_function("compare_parse_numbers", |bench| {
        bench.iter(|| parse_numbers(black_box("The NPV is 1,234.56 EUR at -4.2e-3 drift")));
    });
}

criterion_group!(benches, bench_compare);
criterion_main!(benches);
