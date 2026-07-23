//! Prints label trajectories under three practice patterns, which is the
//! five-minute explanation of the model in runnable form:
//!
//!   cargo run --example trajectories

use tirocinium_mastery::*;

const DAY: i64 = 86_400;

fn run(name: &str, events: &[WeightedEvent], p: &Params) {
    println!("\n{name}");
    let mut state: Option<State> = None;
    for (i, we) in events.iter().enumerate() {
        let st = apply(state.as_ref(), we, p);
        println!(
            "  event {:>2} at day {:>4.1}: m={:.3} s={:>5.2}d label={:?}",
            i + 1,
            we.event.at as f64 / DAY as f64,
            st.m,
            st.s,
            st.label
        );
        state = Some(st);
    }
    if let Some(st) = state {
        for extra in [7, 21, 60] {
            let now = st.t_last + extra * DAY;
            println!(
                "  +{extra:>2} idle days: m_eff={:.3} label={:?} revisit={}",
                st.m_eff(now, p),
                compute_label(&st, now, p),
                st.due_for_revisit(now, p)
            );
        }
    }
}

fn pg(day: f64) -> WeightedEvent {
    WeightedEvent::new(
        Event {
            source: Source::AnswerMatch,
            score: 1.0,
            confidence: 0.95,
            ref_kind: RefKind::Submission,
            ref_id: (day * 10.0) as i64,
            at: (day * DAY as f64) as i64,
        },
        1.0,
    )
}

fn main() {
    let p = Params::default();

    let steady: Vec<_> = (0..10).map(|i| pg(i as f64)).collect();
    run(
        "Steady daily practice (correct answers, clean scans)",
        &steady,
        &p,
    );

    let crammed: Vec<_> = (0..10).map(|i| pg(i as f64 / 24.0)).collect();
    run("The same ten successes crammed into one day", &crammed, &p);

    let spaced: Vec<_> = [0.0, 1.0, 2.0, 4.0, 7.0, 12.0, 20.0]
        .iter()
        .map(|d| pg(*d))
        .collect();
    run(
        "Expanding-interval practice (the revisit queue's rhythm)",
        &spaced,
        &p,
    );
}
