//! Property tests for the guarantees named in spec sections 8 and 10:
//! bounds, monotonicity, replay determinism, grinding resistance, and
//! no-harm-from-low-confidence, checked over generated event streams.

use proptest::prelude::*;
use tirocinium_mastery::*;

const DAY: i64 = 86_400;

fn arb_source() -> impl Strategy<Value = Source> {
    prop_oneof![
        Just(Source::ProfessorGrade),
        Just(Source::AnswerMatch),
        Just(Source::DefenseRubric),
        Just(Source::WorkingAssessment),
    ]
}

prop_compose! {
    fn arb_event(max_gap_days: i64)(
        source in arb_source(),
        score in 0.0f64..=1.0,
        confidence in 0.0f64..=1.0,
        gap_seconds in 0i64..=(max_gap_days * DAY),
        k in 0.05f64..=1.0,
    ) -> (Source, f64, f64, i64, f64) {
        (source, score, confidence, gap_seconds, k)
    }
}

fn build_stream(raw: &[(Source, f64, f64, i64, f64)]) -> Vec<WeightedEvent> {
    let mut at = 0i64;
    raw.iter()
        .enumerate()
        .map(|(i, (source, score, confidence, gap, k))| {
            at += gap;
            WeightedEvent::new(
                Event {
                    source: *source,
                    score: *score,
                    confidence: *confidence,
                    ref_kind: RefKind::Submission,
                    ref_id: i as i64,
                    at,
                },
                *k,
            )
        })
        .collect()
}

proptest! {
    /// Bounds: m stays in [0,1], s stays in [s_min, s_max], for any stream.
    #[test]
    fn bounds_hold(raw in prop::collection::vec(arb_event(30), 1..80)) {
        let p = Params::default();
        let stream = build_stream(&raw);
        let mut state: Option<State> = None;
        for we in &stream {
            let st = apply(state.as_ref(), we, &p);
            prop_assert!((0.0..=1.0).contains(&st.m), "m out of bounds: {}", st.m);
            prop_assert!(st.s >= p.s_min_days - 1e-12 && st.s <= p.s_max_days + 1e-12,
                "s out of bounds: {}", st.s);
            state = Some(st);
        }
    }

    /// Replay determinism: two replays of the same stream agree exactly.
    #[test]
    fn replay_is_deterministic(raw in prop::collection::vec(arb_event(30), 1..80)) {
        let p = Params::default();
        let stream = build_stream(&raw);
        let a = replay(&stream, &p);
        let b = replay(&stream, &p);
        prop_assert_eq!(a, b);
    }

    /// Monotonicity (spec 10): with history fixed, a higher-scoring final
    /// event never yields lower mastery.
    #[test]
    fn final_event_is_monotone_in_score(
        raw in prop::collection::vec(arb_event(30), 0..40),
        source in arb_source(),
        confidence in 0.0f64..=1.0,
        gap in 0i64..=(30 * DAY),
        k in 0.05f64..=1.0,
        lo in 0.0f64..=1.0,
        hi in 0.0f64..=1.0,
    ) {
        let p = Params::default();
        let stream = build_stream(&raw);
        let base = replay(&stream, &p);
        let at = stream.last().map(|w| w.event.at).unwrap_or(0) + gap;
        let (lo, hi) = if lo <= hi { (lo, hi) } else { (hi, lo) };
        let mk = |score: f64| WeightedEvent::new(Event {
            source, score, confidence,
            ref_kind: RefKind::Submission, ref_id: 999_999, at,
        }, k);
        let m_lo = apply(base.as_ref(), &mk(lo), &p).m;
        let m_hi = apply(base.as_ref(), &mk(hi), &p).m;
        prop_assert!(m_hi >= m_lo - 1e-12, "m_hi {} < m_lo {}", m_hi, m_lo);
    }

    /// Zero-confidence events change nothing about m or s.
    #[test]
    fn zero_confidence_is_inert(
        raw in prop::collection::vec(arb_event(30), 1..40),
        source in arb_source(),
        score in 0.0f64..=1.0,
        gap in 1i64..=(5 * DAY),
    ) {
        let p = Params::default();
        let stream = build_stream(&raw);
        let base = replay(&stream, &p).unwrap();
        let at = base.t_last + gap;
        let inert = WeightedEvent::new(Event {
            source, score, confidence: 0.0,
            ref_kind: RefKind::Submission, ref_id: 999_999, at,
        }, 1.0);
        let st = apply(Some(&base), &inert, &p);
        // Stored m is the fresh-ability estimate (spec v0.2): an inert event
        // leaves it exactly unchanged, and s unchanged.
        prop_assert!((st.m - base.m).abs() < 1e-12);
        prop_assert!((st.s - base.s).abs() < 1e-12);
    }

    /// Grinding resistance (spec 8): any number of same-hour perfect
    /// attempts never reaches Solid, and the k-th same-session attempt
    /// contributes no more than the damper permits.
    #[test]
    fn grinding_never_reaches_solid(n in 2usize..60) {
        let p = Params::default();
        let stream: Vec<_> = (0..n).map(|i| WeightedEvent::new(Event {
            source: Source::AnswerMatch,
            score: 1.0,
            confidence: 1.0,
            ref_kind: RefKind::Submission,
            ref_id: i as i64,
            at: (i as i64) * 60, // one attempt per minute
        }, 1.0)).collect();
        let st = replay(&stream, &p).unwrap();
        prop_assert_ne!(st.label, Label::Solid);
        // And stability barely moves: rho is ~0 for one-minute gaps.
        prop_assert!(st.s < p.s0_days * 1.05, "s = {}", st.s);
    }
}

/// Massed damping is exactly 1/(1+n) within the window: the second
/// same-session identical event moves m by strictly less than the first.
#[test]
fn same_session_gains_diminish() {
    let p = Params::default();
    let e = |i: i64| WeightedEvent::new(Event {
        source: Source::AnswerMatch, score: 1.0, confidence: 1.0,
        ref_kind: RefKind::Submission, ref_id: i, at: i * 600,
    }, 1.0);
    let st1 = apply(None, &e(0), &p);
    let gain1 = st1.m - p.m0;
    let st2 = apply(Some(&st1), &e(1), &p);
    let gain2 = st2.m - st1.m;
    // Second gain is damped by 1/2 and also shrunk by the smaller (1 - m) gap.
    assert!(gain2 < gain1 * 0.5 + 1e-12, "gain1={} gain2={}", gain1, gain2);
}
