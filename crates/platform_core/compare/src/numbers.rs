//! Number extraction from answer text. The reading rules, documented because
//! they are the comparer's contract:
//!
//! - A number starts at a digit (or a sign or decimal point directly before
//!   one). A sign counts only when the preceding non-space character is not a
//!   digit, so "5 - 3" reads two positive numbers and "x = -3" reads one
//!   negative one.
//! - Separators (`.` and `,`) are part of a number only between digits.
//!   When both appear, the last one is the decimal separator and the rest
//!   are grouping ("1,234.56" and "1.234,56" both read 1234.56). A repeated
//!   separator is grouping ("1.234.567" reads 1234567). A lone comma is a
//!   decimal separator unless exactly three digits follow it ("3,14" reads
//!   3.14; "1,234" reads 1234, the anglophone convention the prompts
//!   request). A lone dot is always decimal.
//! - Scientific notation (`e`/`E`, optional sign) is read when digits follow.

/// Every number the text displays, in reading order.
#[must_use]
pub fn parse_numbers(text: &str) -> Vec<f64> {
    let chars: Vec<char> = text.chars().collect();
    let mut numbers = Vec::new();
    let mut i = 0;
    let mut previous_digit = false;
    while i < chars.len() {
        let c = chars[i];
        let signed_start =
            (c == '-' || c == '+') && !previous_digit && starts_number(&chars, i + 1);
        if signed_start || starts_number(&chars, i) {
            let negative = c == '-';
            let start = if signed_start { i + 1 } else { i };
            let (value, end) = read_number(&chars, start);
            if let Some(value) = value {
                numbers.push(if negative { -value } else { value });
            }
            previous_digit = true;
            i = end;
            continue;
        }
        if !c.is_whitespace() {
            previous_digit = c.is_ascii_digit();
        }
        i += 1;
    }
    numbers
}

/// Whether a number begins at `i`: a digit, or a decimal point directly
/// before one.
fn starts_number(chars: &[char], i: usize) -> bool {
    match chars.get(i) {
        Some(c) if c.is_ascii_digit() => true,
        Some('.') => matches!(chars.get(i + 1), Some(d) if d.is_ascii_digit()),
        _ => false,
    }
}

/// Read the number starting at `start` (no sign), returning the value and the
/// index just past it.
fn read_number(chars: &[char], start: usize) -> (Option<f64>, usize) {
    let mut raw = String::new();
    let mut i = start;
    while i < chars.len() {
        let c = chars[i];
        let separator_between_digits =
            (c == '.' || c == ',') && matches!(chars.get(i + 1), Some(d) if d.is_ascii_digit());
        if !c.is_ascii_digit() && !separator_between_digits {
            break;
        }
        raw.push(c);
        i += 1;
    }
    let mut normalized = normalize_separators(&raw);
    // Scientific notation: e/E, optional sign, at least one digit.
    if let Some(&e) = chars.get(i) {
        if e == 'e' || e == 'E' {
            let mut j = i + 1;
            let mut exponent = String::new();
            if matches!(chars.get(j), Some('-' | '+')) {
                exponent.push(chars[j]);
                j += 1;
            }
            while matches!(chars.get(j), Some(d) if d.is_ascii_digit()) {
                exponent.push(chars[j]);
                j += 1;
            }
            if exponent.chars().any(|d| d.is_ascii_digit()) {
                normalized.push('e');
                normalized.push_str(&exponent);
                i = j;
            }
        }
    }
    (normalized.parse::<f64>().ok(), i)
}

/// Resolve grouping and decimal separators to a plain `1234.56` form.
fn normalize_separators(raw: &str) -> String {
    let dots = raw.matches('.').count();
    let commas = raw.matches(',').count();
    let decimal: Option<char> = if dots > 0 && commas > 0 {
        // Mixed separators: the last one is the decimal separator.
        raw.rfind(['.', ','])
            .and_then(|at| raw[at..].chars().next())
    } else if dots == 1 && commas == 0 {
        Some('.')
    } else if commas == 1 && dots == 0 {
        // A lone comma groups thousands only in the x,xxx shape.
        let after = raw.rsplit(',').next().map_or(0, str::len);
        if after == 3 {
            None
        } else {
            Some(',')
        }
    } else {
        // Repeated single-kind separators are grouping.
        None
    };
    raw.chars()
        .filter_map(|c| match c {
            '.' | ',' if Some(c) == decimal => Some('.'),
            '.' | ',' => None,
            digit => Some(digit),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn one(text: &str) -> f64 {
        let numbers = parse_numbers(text);
        assert_eq!(numbers.len(), 1, "expected one number in {text:?}");
        numbers[0]
    }

    #[test]
    fn plain_and_decorated_decimals() {
        assert!((one("42") - 42.0).abs() < f64::EPSILON);
        assert!((one("The NPV is 1,234.56 EUR, positive.") - 1234.56).abs() < 1e-9);
        assert!((one("1.234,56") - 1234.56).abs() < 1e-9);
        assert!((one("2,54") - 2.54).abs() < 1e-9);
        assert!((one("1,234") - 1234.0).abs() < f64::EPSILON);
        assert!((one("1.234.567") - 1_234_567.0).abs() < f64::EPSILON);
        assert!((one("8%") - 8.0).abs() < f64::EPSILON);
        assert!((one(".5 kg") - 0.5).abs() < f64::EPSILON);
    }

    #[test]
    fn signs_and_scientific_notation() {
        assert!((one("x = -3") - -3.0).abs() < f64::EPSILON);
        assert!((one("-4.2e-3 V") - -0.0042).abs() < 1e-12);
        assert!((one("5e-1") - 0.5).abs() < f64::EPSILON);
        assert!((one("1E3") - 1000.0).abs() < f64::EPSILON);
        assert_eq!(parse_numbers("5 - 3"), vec![5.0, 3.0]);
    }

    #[test]
    fn what_is_not_a_number() {
        assert!(parse_numbers("accept the project").is_empty());
        assert!(parse_numbers("").is_empty());
        // A trailing separator is not part of the number.
        assert_eq!(parse_numbers("42."), vec![42.0]);
        // An exponent needs digits; a bare e is text.
        assert_eq!(parse_numbers("42e"), vec![42.0]);
    }

    #[test]
    fn reading_order_is_preserved() {
        assert_eq!(
            parse_numbers("I1 = 2.5 mA and I2 = 0.5 mA"),
            vec![1.0, 2.5, 2.0, 0.5]
        );
    }
}
