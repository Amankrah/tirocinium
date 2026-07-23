//! # tirocinium-mastery
//!
//! Reference implementation of the Tirocinium mastery model, specification
//! v0.1. The crate is a pure library: state is a function of an event stream
//! and a parameter set, and nothing else. The platform's Python layer calls
//! [`engine::apply`] on each new evidence event (holding the cached state) and
//! [`engine::replay`] for supersession, audits, and parameter fitting.
//!
//! Spec cross-references appear as `(spec X.Y)` throughout the source.

pub mod engine;
pub mod events;
pub mod params;
#[cfg(feature = "python")]
mod python;

pub use engine::{apply, compute_label, replay, Label, State};
pub use events::{apply_supersession, Event, RefKind, Source, WeightedEvent};
pub use params::Params;

use serde::Serialize;

/// One line of the transparency contract (spec section 9): an evidence event
/// rendered as plain language for the student-facing trail. Rendering is a
/// model concern because the wording must match what the model actually did
/// with the event.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct TrailLine {
    pub at: i64,
    pub text: String,
}

/// Produce the plain-language evidence trail for the most recent `limit`
/// events, newest first, plus a decay line when decay is currently the
/// dominant story (spec 4.5, 9).
pub fn evidence_trail(
    events: &[WeightedEvent],
    state: &State,
    now: i64,
    p: &Params,
    limit: usize,
) -> Vec<TrailLine> {
    let mut lines: Vec<TrailLine> = Vec::new();

    let r = state.retention(now, p);
    if r < p.revisit_r && state.m >= p.revisit_m {
        let days = ((now - state.t_last).max(0)) as f64 / events::SECONDS_PER_DAY;
        lines.push(TrailLine {
            at: now,
            text: format!(
                "Fading: last practiced {:.0} days ago. One fresh variant will tell us where you stand.",
                days
            ),
        });
    }

    for we in events.iter().rev().take(limit) {
        let e = &we.event;
        let text = match (e.source, e.score) {
            (Source::ProfessorGrade, s) if s >= p.success_e => {
                "Your professor marked this work as strong.".to_string()
            }
            (Source::ProfessorGrade, _) => {
                "Your professor's grading points to more work needed here.".to_string()
            }
            (Source::AnswerMatch, s) if s >= p.success_e => {
                "Correct final answer.".to_string()
            }
            (Source::AnswerMatch, _) => "Final answer didn't match.".to_string(),
            (Source::DefenseRubric, s) if s >= p.success_e => {
                "Defended the reasoning well in conversation.".to_string()
            }
            (Source::DefenseRubric, _) => {
                "The conversation surfaced a gap worth revisiting.".to_string()
            }
            (Source::WorkingAssessment, s) if s >= p.success_e => {
                "Your written working shows a sound method.".to_string()
            }
            (Source::WorkingAssessment, _) => {
                "Your written working suggests the method needs another look.".to_string()
            }
        };
        lines.push(TrailLine { at: e.at, text });
    }
    lines
}
