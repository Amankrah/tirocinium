//! The tolerant numeric comparer (backend guide 6.3, milestone 5.3). Variant
//! verification is a two-model loop whose agreement question is decided
//! programmatically where answers are numeric: the generation pass and the
//! independent re-solve each end in a structured list of final answers, and
//! this crate decides whether those lists agree.
//!
//! Comparison is deliberately conservative: a wrongly verified variant would
//! be served to students, a wrongly flagged one only costs a professor a
//! review. Answers compare element by element in order (both passes answer
//! the same sub-questions); every number one answer displays must match its
//! counterpart within tolerance, answers without numbers must match as
//! normalized text, and any structural difference (different counts of
//! answers or of numbers) is a mismatch.
//!
//! Number reading handles the formats worked solutions actually use: plain
//! decimals, scientific notation, dot-thousands with comma-decimal and the
//! reverse ("1,234.56" and "1.234,56" both read 1234.56), a lone decimal
//! comma ("3,14"), and a leading sign. A lone comma before exactly three
//! digits reads as a thousands separator ("1,234" is 1234), documented
//! ambiguity resolved toward the anglophone convention the prompts request.

mod numbers;
#[cfg(feature = "python")]
pub mod python;

pub use numbers::parse_numbers;

/// The outcome of comparing two final-answer lists.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Comparison {
    /// Every answer agrees within tolerance: the variant can be `verified`.
    Match,
    /// At least one answer disagrees: the variant is `flagged`, never served.
    Mismatch,
    /// Both lists are empty, so there is nothing to compare; the caller
    /// treats this as unverifiable (flagged), never as agreement.
    NoAnswers,
}

impl Comparison {
    /// The stable string the Python layer stores and branches on.
    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            Comparison::Match => "match",
            Comparison::Mismatch => "mismatch",
            Comparison::NoAnswers => "no_answers",
        }
    }
}

/// Whether two numbers agree within `max(abs_tol, rel_tol * max(|a|, |b|))`.
#[must_use]
pub fn numbers_agree(a: f64, b: f64, rel_tol: f64, abs_tol: f64) -> bool {
    let tolerance = abs_tol.max(rel_tol * a.abs().max(b.abs()));
    (a - b).abs() <= tolerance
}

/// Whether two single answers agree: their numbers pairwise within tolerance
/// when both have any, their normalized text when neither does, and never
/// when one side has numbers the other lacks.
#[must_use]
pub fn answers_agree(a: &str, b: &str, rel_tol: f64, abs_tol: f64) -> bool {
    let nums_a = parse_numbers(a);
    let nums_b = parse_numbers(b);
    if nums_a.is_empty() && nums_b.is_empty() {
        return normalize(a) == normalize(b);
    }
    nums_a.len() == nums_b.len()
        && nums_a
            .iter()
            .zip(&nums_b)
            .all(|(&x, &y)| numbers_agree(x, y, rel_tol, abs_tol))
}

/// Compare two final-answer lists element by element, in order.
///
/// The lists must have the same length and every pair must agree; a length
/// difference is a [`Comparison::Mismatch`]. Two empty lists are
/// [`Comparison::NoAnswers`]: nothing was compared, so nothing was verified.
#[must_use]
pub fn compare_answer_lists(a: &[String], b: &[String], rel_tol: f64, abs_tol: f64) -> Comparison {
    if a.is_empty() && b.is_empty() {
        return Comparison::NoAnswers;
    }
    if a.len() != b.len() {
        return Comparison::Mismatch;
    }
    if a.iter()
        .zip(b)
        .all(|(x, y)| answers_agree(x, y, rel_tol, abs_tol))
    {
        Comparison::Match
    } else {
        Comparison::Mismatch
    }
}

/// Check whether every expected final answer appears in a free-text
/// transcription (the `answer_match` evidence source, guide 6.6 and mastery
/// spec section 3): each answer's number sequence must occur as a contiguous
/// run, in order, among the numbers the text displays, each within
/// tolerance.
///
/// [`Comparison::NoAnswers`] when the expected answers carry no numbers
/// (essay-style, nothing to compare) or the text displays none (an illegible
/// or numberless reading is not evidence either way; the event is simply not
/// emitted). All answers found is a [`Comparison::Match`]; anything else is
/// a [`Comparison::Mismatch`].
#[must_use]
pub fn answers_in_text(answers: &[String], text: &str, rel_tol: f64, abs_tol: f64) -> Comparison {
    let expected: Vec<Vec<f64>> = answers
        .iter()
        .map(|answer| parse_numbers(answer))
        .filter(|numbers| !numbers.is_empty())
        .collect();
    if expected.is_empty() {
        return Comparison::NoAnswers;
    }
    let shown = parse_numbers(text);
    if shown.is_empty() {
        return Comparison::NoAnswers;
    }
    let all_found = expected
        .iter()
        .all(|sequence| contains_run(&shown, sequence, rel_tol, abs_tol));
    if all_found {
        Comparison::Match
    } else {
        Comparison::Mismatch
    }
}

/// Whether `sequence` occurs as a contiguous run inside `shown`, each pair
/// within tolerance.
fn contains_run(shown: &[f64], sequence: &[f64], rel_tol: f64, abs_tol: f64) -> bool {
    if sequence.is_empty() || sequence.len() > shown.len() {
        return false;
    }
    shown.windows(sequence.len()).any(|window| {
        window
            .iter()
            .zip(sequence)
            .all(|(&a, &b)| numbers_agree(a, b, rel_tol, abs_tol))
    })
}

/// Text comparison for answers without numbers: trimmed, whitespace
/// collapsed, case folded. Deliberately strict beyond that; a paraphrase the
/// comparer cannot vouch for goes to the professor as a flag, not to a
/// student as verified.
fn normalize(text: &str) -> String {
    text.split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

#[cfg(test)]
mod tests {
    use super::*;

    const REL: f64 = 5e-3;
    const ABS: f64 = 1e-9;

    fn lists(a: &[&str], b: &[&str]) -> Comparison {
        let a: Vec<String> = a.iter().map(ToString::to_string).collect();
        let b: Vec<String> = b.iter().map(ToString::to_string).collect();
        compare_answer_lists(&a, &b, REL, ABS)
    }

    #[test]
    fn identical_numeric_answers_match() {
        assert_eq!(
            lists(&["NPV = 1234.56 EUR"], &["1,234.56"]),
            Comparison::Match
        );
    }

    #[test]
    fn formatting_never_changes_the_value() {
        assert_eq!(lists(&["42"], &["42.0"]), Comparison::Match);
        assert_eq!(lists(&["4.2e1"], &["42"]), Comparison::Match);
        assert_eq!(lists(&["1.234,56"], &["1234.56"]), Comparison::Match);
        assert_eq!(lists(&["2,54"], &["2.54"]), Comparison::Match);
        assert_eq!(lists(&["-0.0042"], &["-4.2e-3 V"]), Comparison::Match);
    }

    #[test]
    fn a_value_outside_tolerance_mismatches() {
        assert_eq!(lists(&["100.0"], &["101.0"]), Comparison::Mismatch);
        // Within the 0.5% relative tolerance instead.
        assert_eq!(lists(&["100.0"], &["100.4"]), Comparison::Match);
    }

    #[test]
    fn different_answer_counts_mismatch() {
        assert_eq!(lists(&["42", "7"], &["42"]), Comparison::Mismatch);
    }

    #[test]
    fn different_number_counts_within_an_answer_mismatch() {
        assert_eq!(lists(&["42 and 7"], &["42"]), Comparison::Mismatch);
    }

    #[test]
    fn numbers_on_one_side_only_mismatch() {
        assert_eq!(
            lists(&["accept the project"], &["42"]),
            Comparison::Mismatch
        );
    }

    #[test]
    fn textual_answers_compare_normalized() {
        assert_eq!(
            lists(&["Accept  the project"], &["accept the project"]),
            Comparison::Match
        );
        assert_eq!(
            lists(&["accept the project"], &["reject the project"]),
            Comparison::Mismatch
        );
    }

    #[test]
    fn empty_lists_are_no_answers_not_agreement() {
        assert_eq!(lists(&[], &[]), Comparison::NoAnswers);
    }

    fn in_text(answers: &[&str], text: &str) -> Comparison {
        let answers: Vec<String> = answers.iter().map(ToString::to_string).collect();
        answers_in_text(&answers, text, REL, ABS)
    }

    #[test]
    fn an_answer_is_found_in_a_transcription() {
        assert_eq!(
            in_text(
                &["2.553 mA"],
                "Working: I = V/R = 12/4700, so I = 2.553 mA. Done."
            ),
            Comparison::Match
        );
        // Tolerance applies to the student's rounding too.
        assert_eq!(in_text(&["2.553 mA"], "I = 2.55 mA"), Comparison::Match);
    }

    #[test]
    fn a_wrong_answer_in_the_transcription_mismatches() {
        assert_eq!(in_text(&["2.553 mA"], "I = 9.9 mA"), Comparison::Mismatch);
    }

    #[test]
    fn a_multi_number_answer_must_appear_as_a_contiguous_run() {
        assert_eq!(
            in_text(&["x = 2 and y = 3"], "we get 2 and then 3"),
            Comparison::Match
        );
        assert_eq!(
            in_text(&["x = 2 and y = 3"], "we get 2, then 7, then 3"),
            Comparison::Mismatch
        );
    }

    #[test]
    fn nothing_to_compare_is_no_answers_never_a_verdict() {
        // Essay-style expected answers carry no numbers.
        assert_eq!(
            in_text(&["accept the project"], "I would accept it"),
            Comparison::NoAnswers
        );
        // An illegible or numberless reading is not evidence either way.
        assert_eq!(
            in_text(&["2.553 mA"], "the working is smudged"),
            Comparison::NoAnswers
        );
    }

    #[test]
    fn comparison_strings_are_stable() {
        assert_eq!(Comparison::Match.as_str(), "match");
        assert_eq!(Comparison::Mismatch.as_str(), "mismatch");
        assert_eq!(Comparison::NoAnswers.as_str(), "no_answers");
    }
}

#[cfg(test)]
mod properties {
    use super::*;
    use proptest::prelude::*;

    const REL: f64 = 5e-3;
    const ABS: f64 = 1e-9;

    fn finite() -> impl Strategy<Value = f64> {
        // Magnitudes worked solutions actually produce; formatting round-trips
        // through decimal text, so subnormals and 1e300 are out of scope.
        prop_oneof![-1e12_f64..1e12_f64, -1.0_f64..1.0_f64,]
    }

    proptest! {
        #[test]
        fn every_list_matches_itself(values in prop::collection::vec(finite(), 1..6)) {
            let list: Vec<String> = values.iter().map(|v| format!("{v}")).collect();
            prop_assert_eq!(
                compare_answer_lists(&list, &list, REL, ABS),
                Comparison::Match
            );
        }

        #[test]
        fn comparison_is_symmetric(
            a in prop::collection::vec("[ -~]{0,20}", 0..4),
            b in prop::collection::vec("[ -~]{0,20}", 0..4),
        ) {
            prop_assert_eq!(
                compare_answer_lists(&a, &b, REL, ABS),
                compare_answer_lists(&b, &a, REL, ABS)
            );
        }

        #[test]
        fn agreement_is_monotone_in_tolerance(x in finite(), y in finite()) {
            if numbers_agree(x, y, REL, ABS) {
                prop_assert!(numbers_agree(x, y, REL * 2.0, ABS * 2.0));
            }
        }

        #[test]
        fn scientific_notation_reads_the_same_value(v in finite()) {
            let plain = format!("{v}");
            let scientific = format!("{v:e}");
            prop_assert!(answers_agree(&plain, &scientific, REL, ABS));
        }

        #[test]
        fn a_perturbation_beyond_tolerance_mismatches(v in finite()) {
            // Nudge well past both tolerances; agreement here would mean the
            // comparer verifies genuinely different answers.
            let delta = 4.0 * (ABS + REL * v.abs()).max(1e-6);
            let a = vec![format!("{v}")];
            let b = vec![format!("{}", v + delta)];
            prop_assert_eq!(
                compare_answer_lists(&a, &b, REL, ABS),
                Comparison::Mismatch
            );
        }
    }
}
