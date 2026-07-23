//! The evidence model (spec section 3). Events are immutable observations;
//! nothing updates mastery except through a stream of these.

use serde::{Deserialize, Serialize};

pub const SECONDS_PER_DAY: f64 = 86_400.0;
pub const SECONDS_PER_HOUR: f64 = 3_600.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Source {
    ProfessorGrade,
    AnswerMatch,
    DefenseRubric,
    WorkingAssessment,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RefKind {
    Submission,
    Conversation,
    Grade,
}

/// One row of the `evidence_events` table, scoped to a single (seat, concept).
/// The case-to-concept mapping weight `k` travels with the event into the
/// update step but is not part of the stored observation (spec section 3);
/// callers supply it per event at replay time via [`WeightedEvent`].
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Event {
    pub source: Source,
    /// Quality of the demonstration, e in [0, 1].
    pub score: f64,
    /// Trust in this reading, c in [0, 1].
    pub confidence: f64,
    pub ref_kind: RefKind,
    pub ref_id: i64,
    /// Unix seconds.
    pub at: i64,
}

/// An event paired with the concept weight `k` of the case that produced it.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct WeightedEvent {
    pub event: Event,
    /// Case-to-concept mapping weight, k in (0, 1].
    pub k: f64,
}

impl WeightedEvent {
    pub fn new(event: Event, k: f64) -> Self {
        WeightedEvent { event, k }
    }
}

/// Professor supersession (spec sections 3 and 4.6): a `professor_grade`
/// event on a submission retracts the automatic events derived from that same
/// submission. This helper filters a stream accordingly; replaying the
/// filtered stream is the supersession. The stream must be time-ordered;
/// output order is preserved.
pub fn apply_supersession(events: &[WeightedEvent]) -> Vec<WeightedEvent> {
    let graded_submissions: std::collections::HashSet<i64> = events
        .iter()
        .filter(|w| w.event.source == Source::ProfessorGrade)
        .map(|w| w.event.ref_id)
        .collect();

    events
        .iter()
        .filter(|w| {
            let e = &w.event;
            let automatic_on_submission = e.ref_kind == RefKind::Submission
                && matches!(e.source, Source::AnswerMatch | Source::WorkingAssessment);
            !(automatic_on_submission && graded_submissions.contains(&e.ref_id))
        })
        .copied()
        .collect()
}
