# variant-generation

## v1

Initial version (milestone 5.3). One call produces the variant body with the
sampled values in place, a complete worked solution, and structured final
answers (at least four significant figures, so the comparer's 0.5% relative
tolerance is generous). fig:// tokens are kept exactly; invariants are checked
against the model's own solution; hostile text inside the base content is
data, never instructions.
