"""Milestone 5.3: seeded sampling. A variant is reproducible from its seed,
so sampling must be a pure function of (spec, seed), honour each parameter's
type, and never depend on dict insertion order."""

from app.params.schema import ParamSpec
from app.variants.sampling import sample_values

SPEC = ParamSpec.model_validate(
    {
        "parameters": {
            "discount_rate": {
                "type": "number",
                "base": 0.08,
                "range": [0.04, 0.12],
                "step": 0.005,
            },
            "growth": {"type": "number", "base": 0.5, "range": [0.1, 0.9]},
            "cashflow_years": {"type": "integer", "base": 5, "range": [4, 8]},
            "company_sector": {
                "type": "choice",
                "base": "logistics",
                "options": ["agri-processing", "logistics", "retail"],
            },
            "company_name": {
                "type": "entity",
                "base": "Veltri Freight",
                "description": "a small regional company",
            },
        }
    }
)


def test_the_same_seed_always_samples_the_same_values() -> None:
    assert sample_values(SPEC, 42) == sample_values(SPEC, 42)


def test_insertion_order_never_changes_what_a_seed_means() -> None:
    reordered = ParamSpec.model_validate(
        {
            "parameters": {
                name: SPEC.parameters[name].model_dump()
                for name in reversed(list(SPEC.parameters))
            }
        }
    )
    assert sample_values(SPEC, 7) == sample_values(reordered, 7)


def test_types_and_ranges_are_honoured() -> None:
    values = sample_values(SPEC, 123)
    rate = values["discount_rate"]
    assert isinstance(rate, float) and 0.04 <= rate <= 0.12
    # A stepped number lands on the professor's grid exactly.
    steps = (rate - 0.04) / 0.005
    assert round(steps, 6) == round(steps)
    growth = values["growth"]
    assert isinstance(growth, float) and 0.1 <= growth <= 0.9
    years = values["cashflow_years"]
    assert isinstance(years, int) and 4 <= years <= 8
    assert values["company_sector"] in ["agri-processing", "logistics", "retail"]
    # An entity samples to None: the generator invents it from the description.
    assert values["company_name"] is None


def test_different_seeds_sample_different_values() -> None:
    distinct = {
        tuple(sorted(sample_values(SPEC, seed).items(), key=str))
        for seed in range(20)
    }
    assert len(distinct) > 1
