//! The parameter set from spec section 7. Every constant in the model lives
//! here, is serializable, and carries a version id so replayed states can
//! record which parameters produced them.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Params {
    /// Version identifier for this parameter set (spec 7, 10).
    pub version: String,

    /// Prior mastery at first evidence (m0).
    pub m0: f64,
    /// Initial half-life in days (s0).
    pub s0_days: f64,
    /// Base learning rate (alpha_base).
    pub alpha_base: f64,

    /// Source weights (spec section 3).
    pub w_professor_grade: f64,
    pub w_answer_match: f64,
    pub w_defense_rubric: f64,
    pub w_working_assessment: f64,

    /// Success: e >= success_e and c >= trust_c.
    pub success_e: f64,
    /// Failure: e <= failure_e and c >= trust_c.
    pub failure_e: f64,
    /// Minimum confidence for an event to count as success or failure.
    pub trust_c: f64,

    /// Stability growth factor (g).
    pub g: f64,
    /// Stability multiplier on clear failure.
    pub failure_shrink: f64,
    /// Stability bounds in days.
    pub s_min_days: f64,
    pub s_max_days: f64,
    /// Cap on rho = delta_t / s in the stability update.
    pub rho_cap: f64,

    /// Massed-practice damper window in hours (spec 4.3).
    pub massed_window_hours: f64,

    /// Solid promotion criteria (spec 4.5).
    pub solid_m_eff: f64,
    pub solid_s_days: f64,
    pub solid_min_events: u32,
    pub solid_spacing_hours: f64,
    /// answer_match counts as high-trust only when c >= this.
    pub high_trust_answer_match_c: f64,
    /// defense_rubric counts as high-trust only when e >= this.
    pub high_trust_defense_e: f64,

    /// Developing promotion threshold.
    pub developing_m_eff: f64,
    /// Hysteresis margin for demotion.
    pub hysteresis: f64,

    /// Revisit queue trigger (spec 5).
    pub revisit_r: f64,
    pub revisit_m: f64,
}

impl Default for Params {
    /// The spec section 7 defaults, verbatim.
    fn default() -> Self {
        Params {
            version: "spec-0.1-defaults".to_string(),
            m0: 0.30,
            s0_days: 2.0,
            alpha_base: 0.35,
            w_professor_grade: 1.00,
            w_answer_match: 0.75,
            w_defense_rubric: 0.60,
            w_working_assessment: 0.45,
            success_e: 0.7,
            failure_e: 0.3,
            trust_c: 0.4,
            g: 0.9,
            failure_shrink: 0.6,
            s_min_days: 1.0,
            s_max_days: 90.0,
            rho_cap: 2.0,
            massed_window_hours: 18.0,
            solid_m_eff: 0.75,
            solid_s_days: 7.0,
            solid_min_events: 3,
            solid_spacing_hours: 72.0,
            high_trust_answer_match_c: 0.7,
            high_trust_defense_e: 0.67,
            developing_m_eff: 0.40,
            hysteresis: 0.05,
            revisit_r: 0.70,
            revisit_m: 0.5,
        }
    }
}
