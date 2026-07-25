# Mirrors crates/platform_core/compare/src/python.rs. The tolerant numeric
# comparer (backend guide 6.3): decides whether two final-answer lists agree,
# element by element in order, each number within
# max(abs_tol, rel_tol * max(|a|, |b|)); answers without numbers compare as
# normalized text. Returns 'match' | 'mismatch' | 'no_answers' (both lists
# empty; treated as unverifiable, never as agreement).

def compare_answer_lists(
    a: list[str], b: list[str], rel_tol: float, abs_tol: float
) -> str: ...

# Every number an answer displays, in reading order ("1,234.56", "1.234,56",
# "3,14", "-4.2e-3" all read per the documented separator rules).
def parse_numbers(text: str) -> list[float]: ...
