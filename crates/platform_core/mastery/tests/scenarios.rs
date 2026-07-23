//! Scenario tests: the spec's own narrative examples and the label
//! mechanics, checked as concrete numbers.

use tirocinium_mastery::*;

const DAY: i64 = 86_400;
const HOUR: i64 = 3_600;

fn ev(source: Source, score: f64, confidence: f64, at: i64) -> WeightedEvent {
    WeightedEvent::new(
        Event {
            source,
            score,
            confidence,
            ref_kind: match source {
                Source::ProfessorGrade => RefKind::Grade,
                Source::DefenseRubric => RefKind::Conversation,
                _ => RefKind::Submission,
            },
            ref_id: at, // unique enough for tests
            at,
        },
        1.0,
    )
}

#[test]
fn first_event_initializes_then_applies() {
    let p = Params::default();
    let st = apply(None, &ev(Source::AnswerMatch, 1.0, 1.0, 0), &p);
    // m0 = 0.30, alpha = 0.35 * 0.75 * 1 * 1 * 1 = 0.2625
    // m = 0.30 + 0.2625 * (1.0 - 0.30) = 0.48375
    assert!((st.m - 0.48375).abs() < 1e-12, "m = {}", st.m);
    assert_eq!(st.label, Label::Developing);
    // Success with dt = 0 leaves stability at s0 (rho = 0).
    assert!((st.s - p.s0_days).abs() < 1e-12);
}

#[test]
fn spec_4_1_narrative_decay() {
    // "m = 0.9 with s = 4, three weeks untouched": m_eff = 0.9 * 2^(-21/4).
    let p = Params::default();
    let mut st = apply(None, &ev(Source::ProfessorGrade, 1.0, 1.0, 0), &p);
    st.m = 0.9;
    st.s = 4.0;
    st.t_last = 0;
    let m_eff = st.m_eff(21 * DAY, &p);
    let expected = 0.9 * (2.0_f64).powf(-21.0 / 4.0);
    assert!((m_eff - expected).abs() < 1e-12);
    assert!(
        m_eff < 0.03,
        "three stale weeks leave almost nothing: {}",
        m_eff
    );
}

#[test]
fn success_after_full_half_life_roughly_doubles_stability() {
    let p = Params::default();
    let st0 = apply(None, &ev(Source::AnswerMatch, 1.0, 1.0, 0), &p);
    let s_before = st0.s; // 2 days
    let dt = (s_before * DAY as f64) as i64; // exactly one half-life later
    let st1 = apply(Some(&st0), &ev(Source::AnswerMatch, 1.0, 1.0, dt), &p);
    // rho = 1, c = 1: s *= (1 + 0.9) = 1.9
    assert!((st1.s - s_before * 1.9).abs() < 1e-9, "s = {}", st1.s);
}

#[test]
fn failure_shrinks_stability_to_floor_but_not_below() {
    let p = Params::default();
    let mut st = apply(None, &ev(Source::AnswerMatch, 1.0, 1.0, 0), &p);
    for i in 1..20 {
        st = apply(Some(&st), &ev(Source::AnswerMatch, 0.0, 1.0, i * DAY), &p);
    }
    assert!((st.s - p.s_min_days).abs() < 1e-12);
}

#[test]
fn solid_requires_spacing_and_high_trust() {
    let p = Params::default();

    // Seven daily perfect working_assessment successes: strong m and s, but
    // never solid, because working_assessment is never high-trust.
    let wa_events: Vec<_> = (0..7)
        .map(|i| ev(Source::WorkingAssessment, 1.0, 1.0, i * DAY))
        .collect();
    let st = replay(&wa_events, &p).unwrap();
    assert_ne!(st.label, Label::Solid, "no high-trust success, no solid");

    // Seven daily professor-graded successes: solid on day 6 (verified
    // trajectory: m=0.805, s=7.4, spacing and high-trust satisfied).
    let pg_events: Vec<_> = (0..7)
        .map(|i| ev(Source::ProfessorGrade, 1.0, 1.0, i * DAY))
        .collect();
    let st2 = replay(&pg_events, &p).unwrap();
    assert_eq!(st2.label, Label::Solid, "m={} s={}", st2.m, st2.s);

    // The same seven successes compressed into one sitting: never solid,
    // and this is the grinding property seen from the label side.
    let crammed: Vec<_> = (0..7)
        .map(|i| ev(Source::ProfessorGrade, 1.0, 1.0, i * HOUR))
        .collect();
    let st3 = replay(&crammed, &p).unwrap();
    assert_ne!(st3.label, Label::Solid, "cramming must not reach solid");
}

#[test]
fn hysteresis_holds_solid_across_the_boundary() {
    let p = Params::default();
    let events: Vec<_> = (0..8)
        .map(|i| ev(Source::ProfessorGrade, 1.0, 1.0, i * DAY))
        .collect();
    let st = replay(&events, &p).unwrap();
    assert_eq!(st.label, Label::Solid);

    // Find a time where m_eff sits inside the hysteresis band
    // (solid_m_eff - hysteresis, solid_m_eff): label must still read Solid.
    let mut held_in_band = false;
    for h in 0..(400 * 24) {
        let now = st.t_last + h * HOUR;
        let m_eff = st.m_eff(now, &p);
        if m_eff < p.solid_m_eff && m_eff >= p.solid_m_eff - p.hysteresis {
            assert_eq!(compute_label(&st, now, &p), Label::Solid);
            held_in_band = true;
        }
        if m_eff < p.solid_m_eff - p.hysteresis {
            assert_ne!(compute_label(&st, now, &p), Label::Solid);
            break;
        }
    }
    assert!(held_in_band, "test never sampled the hysteresis band");
}

#[test]
fn revisit_triggers_on_decay_not_on_shaky() {
    let p = Params::default();
    let events: Vec<_> = (0..8)
        .map(|i| ev(Source::ProfessorGrade, 1.0, 1.0, i * DAY))
        .collect();
    let st = replay(&events, &p).unwrap();
    assert!(st.m >= p.revisit_m, "m = {}", st.m);
    // Fresh: not due. After enough staleness for r to fall below the
    // trigger: due, because the label held is not Shaky.
    assert!(!st.due_for_revisit(st.t_last, &p));
    let stale = st.t_last + 30 * DAY;
    assert!(st.retention(stale, &p) < p.revisit_r);
    assert!(st.due_for_revisit(stale, &p));
}

#[test]
fn supersession_removes_automatic_events_for_graded_submission() {
    let p = Params::default();
    let submission_id = 42;
    let auto = WeightedEvent::new(
        Event {
            source: Source::AnswerMatch,
            score: 0.0, // the comparer misread a smudged answer as wrong
            confidence: 0.9,
            ref_kind: RefKind::Submission,
            ref_id: submission_id,
            at: 0,
        },
        1.0,
    );
    let grade = WeightedEvent::new(
        Event {
            source: Source::ProfessorGrade,
            score: 1.0, // the professor read the page and disagreed
            confidence: 1.0,
            ref_kind: RefKind::Grade,
            ref_id: submission_id,
            at: DAY,
        },
        1.0,
    );
    let stream = vec![auto, grade];
    let filtered = apply_supersession(&stream);
    assert_eq!(filtered.len(), 1);
    assert_eq!(filtered[0].event.source, Source::ProfessorGrade);

    let with_auto = replay(&stream, &p).unwrap();
    let without_auto = replay(&filtered, &p).unwrap();
    assert!(
        without_auto.m > with_auto.m,
        "supersession must erase the misread's damage"
    );
}

#[test]
fn concept_weight_scales_the_update() {
    let p = Params::default();
    let full = apply(
        None,
        &WeightedEvent::new(ev(Source::AnswerMatch, 1.0, 1.0, 0).event, 1.0),
        &p,
    );
    let partial = apply(
        None,
        &WeightedEvent::new(ev(Source::AnswerMatch, 1.0, 1.0, 0).event, 0.3),
        &p,
    );
    let gain_full = full.m - p.m0;
    let gain_partial = partial.m - p.m0;
    assert!((gain_partial - gain_full * 0.3).abs() < 1e-12);
}
