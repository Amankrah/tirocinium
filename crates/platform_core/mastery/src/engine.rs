//! The algorithm (spec section 4), implemented as pure functions of
//! (event stream, parameter set). No clocks, no I/O, no randomness:
//! replaying the same stream under the same parameters yields the same
//! state, bit for bit, which is the property everything else leans on.

use crate::events::{Event, Source, WeightedEvent, SECONDS_PER_DAY, SECONDS_PER_HOUR};
use crate::params::Params;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Label {
    Unseen,
    Shaky,
    Developing,
    Solid,
}

/// A success that has already been recognized during replay, kept for the
/// solid-promotion spacing and high-trust checks (spec 4.5).
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
struct SuccessRecord {
    at: i64,
    high_trust: bool,
}

/// Per (seat, concept) state (spec section 4). `m` and `s` are the cache;
/// the auxiliary fields exist so labels and the damper are themselves pure
/// functions of the state plus the next event.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct State {
    /// Mastery estimate, m in [0, 1].
    pub m: f64,
    /// Stability (half-life) in days.
    pub s: f64,
    /// Timestamp of last evidence, unix seconds.
    pub t_last: i64,
    /// Total evidence events observed.
    pub event_count: u32,
    /// Currently held label (needed for hysteresis).
    pub label: Label,
    /// Timestamps of recent events, for the massed-practice damper. Pruned
    /// to the massed window on every update.
    recent_event_times: Vec<i64>,
    /// Recognized successes, for solid promotion checks.
    successes: Vec<SuccessRecord>,
    /// Whether the two-spaced-successes criterion has ever been met.
    spaced_success_met: bool,
}

impl State {
    /// Retention r = 2^(-dt / s) at time `now` (spec 4.1).
    pub fn retention(&self, now: i64, _p: &Params) -> f64 {
        let dt_days = ((now - self.t_last).max(0)) as f64 / SECONDS_PER_DAY;
        (2.0_f64).powf(-(dt_days / self.s))
    }

    /// Effective mastery m_eff = m * r (spec 4.1).
    pub fn m_eff(&self, now: i64, p: &Params) -> f64 {
        self.m * self.retention(now, p)
    }

    /// Revisit queue membership (spec 5): r < revisit_r, m >= revisit_m,
    /// and the held label is not Shaky (and not Unseen, vacuously).
    pub fn due_for_revisit(&self, now: i64, p: &Params) -> bool {
        self.retention(now, p) < p.revisit_r
            && self.m >= p.revisit_m
            && self.label != Label::Shaky
            && self.label != Label::Unseen
    }
}

fn source_weight(source: Source, p: &Params) -> f64 {
    match source {
        Source::ProfessorGrade => p.w_professor_grade,
        Source::AnswerMatch => p.w_answer_match,
        Source::DefenseRubric => p.w_defense_rubric,
        Source::WorkingAssessment => p.w_working_assessment,
    }
}

fn is_success(e: &Event, p: &Params) -> bool {
    e.score >= p.success_e && e.confidence >= p.trust_c
}

fn is_failure(e: &Event, p: &Params) -> bool {
    e.score <= p.failure_e && e.confidence >= p.trust_c
}

/// High-trust success test for the solid criterion (spec 4.5).
fn is_high_trust_success(e: &Event, p: &Params) -> bool {
    if !is_success(e, p) {
        return false;
    }
    match e.source {
        Source::ProfessorGrade => true,
        Source::AnswerMatch => e.confidence >= p.high_trust_answer_match_c,
        Source::DefenseRubric => e.score >= p.high_trust_defense_e,
        Source::WorkingAssessment => false,
    }
}

/// Apply one weighted event to a state, returning the new state (spec 4.2
/// through 4.5). Passing `None` as the state performs initialization.
pub fn apply(state: Option<&State>, we: &WeightedEvent, p: &Params) -> State {
    let e = &we.event;
    let k = we.k.clamp(f64::MIN_POSITIVE, 1.0);
    let score = e.score.clamp(0.0, 1.0);
    let confidence = e.confidence.clamp(0.0, 1.0);

    let mut st = match state {
        Some(s) => s.clone(),
        None => State {
            // Spec 4.2: first evidence initializes, then the event applies.
            m: p.m0,
            s: p.s0_days,
            t_last: e.at,
            event_count: 0,
            label: Label::Unseen,
            recent_event_times: Vec::new(),
            successes: Vec::new(),
            spaced_success_met: false,
        },
    };

    let dt_seconds = (e.at - st.t_last).max(0);
    let dt_days = dt_seconds as f64 / SECONDS_PER_DAY;

    // Spec v0.2 (4.3): the stored m is the fresh-ability estimate and is NOT
    // decayed here. Decay lives entirely in m_eff = m * r, so a successful
    // return after a gap restores the visible picture immediately, which is
    // 4.1's stated relearning philosophy. (v0.1 decayed m before updating;
    // the reference implementation showed that rule caps m near 0.5 under
    // expanding-interval practice, contradicting 4.1 and making Solid
    // unreachable on the revisit queue's own rhythm.)

    // Massed-practice damper: n = prior events within the window.
    let window_start = e.at - (p.massed_window_hours * SECONDS_PER_HOUR) as i64;
    st.recent_event_times.retain(|t| *t >= window_start);
    let n = st.recent_event_times.len() as f64;
    let damper = 1.0 / (1.0 + n);

    // Effective learning rate and the update.
    let w = source_weight(e.source, p);
    let alpha = (p.alpha_base * w * confidence * k * damper).clamp(0.0, 1.0);
    st.m = (st.m + alpha * (score - st.m)).clamp(0.0, 1.0);

    // Spec 4.4: stability.
    if is_success(e, p) {
        let rho = (dt_days / st.s).min(p.rho_cap);
        st.s = (st.s * (1.0 + p.g * rho * confidence)).min(p.s_max_days);
    } else if is_failure(e, p) {
        st.s = (st.s * p.failure_shrink).max(p.s_min_days);
    }
    // Middling or low-confidence events leave s unchanged.

    // Bookkeeping for labels and damper.
    if is_success(e, p) {
        let high_trust = is_high_trust_success(e, p);
        if !st.spaced_success_met {
            let spacing = (p.solid_spacing_hours * SECONDS_PER_HOUR) as i64;
            if st.successes.iter().any(|s0| e.at - s0.at >= spacing) {
                st.spaced_success_met = true;
            }
        }
        st.successes.push(SuccessRecord {
            at: e.at,
            high_trust,
        });
    }
    st.recent_event_times.push(e.at);
    st.event_count += 1;
    st.t_last = e.at;

    // Spec 4.5: recompute the held label at the event's timestamp.
    st.label = compute_label(&st, e.at, p);
    st
}

/// Label computation with hysteresis (spec 4.5). Pure in (state, now, params);
/// uses the currently held label for the demotion margins.
pub fn compute_label(st: &State, now: i64, p: &Params) -> Label {
    if st.event_count == 0 {
        return Label::Unseen;
    }
    let m_eff = st.m_eff(now, p);
    let held = st.label;

    let solid_ok = m_eff >= p.solid_m_eff
        && st.s >= p.solid_s_days
        && st.event_count >= p.solid_min_events
        && st.spaced_success_met
        && st.successes.iter().any(|s0| s0.high_trust);

    if solid_ok {
        return Label::Solid;
    }
    // Hysteresis: solid holds until m_eff drops below threshold - margin,
    // provided the structural criteria (which cannot decay) were once met.
    if held == Label::Solid && m_eff >= p.solid_m_eff - p.hysteresis {
        return Label::Solid;
    }

    if m_eff >= p.developing_m_eff {
        return Label::Developing;
    }
    if held >= Label::Developing && m_eff >= p.developing_m_eff - p.hysteresis {
        return Label::Developing;
    }
    Label::Shaky
}

/// Replay a full time-ordered event stream (spec 4.6). Returns `None` for an
/// empty stream (the Unseen case has no state). Panics in debug builds if the
/// stream is out of order, because an unordered replay is a caller bug, not a
/// model outcome.
pub fn replay(events: &[WeightedEvent], p: &Params) -> Option<State> {
    let mut state: Option<State> = None;
    let mut last_at = i64::MIN;
    for we in events {
        debug_assert!(we.event.at >= last_at, "event stream must be time-ordered");
        last_at = we.event.at;
        state = Some(apply(state.as_ref(), we, p));
    }
    state
}
