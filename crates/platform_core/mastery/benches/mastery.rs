//! Criterion benchmarks for every public function of the crate (backend
//! guide section 8), gated in CI by the absolute budgets committed in
//! crates/platform_core/bench-thresholds.json (decision 0004). Bench ids are
//! flat strings because the threshold checker matches them to criterion's
//! output directories one to one.
//!
//! The spec's own performance claims anchor the budgets: replay of one
//! seat-concept stream is "microseconds of arithmetic" and a full course
//! shard replays "in well under a second" (mastery spec 4.6).

use criterion::{black_box, criterion_group, criterion_main, Criterion};
use tirocinium_mastery::{
    apply, apply_supersession, compute_label, evidence_trail, replay, Event, Params, RefKind,
    Source, State, WeightedEvent,
};

const DAY: i64 = 86_400;

fn event(source: Source, score: f64, ref_id: i64, at: i64) -> WeightedEvent {
    WeightedEvent::new(
        Event {
            source,
            score,
            confidence: 0.9,
            ref_kind: RefKind::Submission,
            ref_id,
            at,
        },
        1.0,
    )
}

/// A mixed stream shaped like a term of real practice: mostly answer matches,
/// periodic professor grades (which supersession must process), occasional
/// defenses.
fn stream(n: usize) -> Vec<WeightedEvent> {
    (0..n)
        .map(|i| {
            let source = match i % 7 {
                0 => Source::ProfessorGrade,
                1 | 2 => Source::WorkingAssessment,
                3 => Source::DefenseRubric,
                _ => Source::AnswerMatch,
            };
            let score = if i % 5 == 0 { 0.2 } else { 1.0 };
            event(source, score, i as i64, i as i64 * DAY / 2)
        })
        .collect()
}

fn settled_state(p: &Params) -> State {
    replay(&stream(50), p).expect("non-empty stream yields a state")
}

fn benches(c: &mut Criterion) {
    let p = Params::default();
    let st = settled_state(&p);
    let one = event(Source::AnswerMatch, 1.0, 999, 400 * DAY);
    let s1000 = stream(1000);
    let s100 = stream(100);
    let now = 400 * DAY;

    c.bench_function("params_default", |b| {
        b.iter(|| black_box(Params::default()))
    });

    c.bench_function("weighted_event_new", |b| {
        b.iter(|| black_box(event(Source::AnswerMatch, 1.0, 1, DAY)))
    });

    c.bench_function("apply_first_event", |b| {
        b.iter(|| black_box(apply(None, black_box(&one), &p)))
    });

    c.bench_function("apply_existing_state", |b| {
        b.iter(|| black_box(apply(Some(black_box(&st)), black_box(&one), &p)))
    });

    c.bench_function("replay_1000_events", |b| {
        b.iter(|| black_box(replay(black_box(&s1000), &p)))
    });

    c.bench_function("supersession_1000_events", |b| {
        b.iter(|| black_box(apply_supersession(black_box(&s1000))))
    });

    // The read-path quartet the API calls on every view.
    c.bench_function("state_view", |b| {
        b.iter(|| {
            black_box(st.retention(now, &p));
            black_box(st.m_eff(now, &p));
            black_box(st.due_for_revisit(now, &p));
            black_box(compute_label(&st, now, &p));
        })
    });

    c.bench_function("evidence_trail_100_events", |b| {
        b.iter(|| black_box(evidence_trail(black_box(&s100), &st, now, &p, 5)))
    });
}

criterion_group!(mastery_benches, benches);
criterion_main!(mastery_benches);
