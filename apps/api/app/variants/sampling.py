"""Seeded sampling of concrete parameter values (backend guide 6.3 step 1).
A variant is reproducible from its seed: the same spec and seed always sample
the same values, which is what makes seed dedupe meaningful and a regeneration
after a prompt change traceable to the same inputs.

Entity parameters sample to None: inventing a coherent replacement is the
generation model's creative act, guided by the spec's description; what was
asked of it is recorded in the seed values either way.
"""

import random

from app.params.schema import (
    ChoiceParameter,
    EntityParameter,
    IntegerParameter,
    NumberParameter,
    ParamSpec,
)

SampledValue = float | int | str | None


def sample_values(spec: ParamSpec, seed: int) -> dict[str, SampledValue]:
    """Sample one concrete value per parameter, deterministically from the
    seed. Parameters are visited in sorted-name order so insertion order can
    never change what a seed means."""
    rng = random.Random(seed)
    values: dict[str, SampledValue] = {}
    for name in sorted(spec.parameters):
        parameter = spec.parameters[name]
        if isinstance(parameter, NumberParameter):
            values[name] = _sample_number(rng, parameter)
        elif isinstance(parameter, IntegerParameter):
            values[name] = rng.randint(parameter.range[0], parameter.range[1])
        elif isinstance(parameter, ChoiceParameter):
            values[name] = rng.choice(parameter.options)
        elif isinstance(parameter, EntityParameter):
            values[name] = None
    return values


def _sample_number(rng: random.Random, parameter: NumberParameter) -> float:
    low, high = parameter.range
    if parameter.step is not None:
        # A stepped parameter samples on its grid, exactly as the professor
        # drew it: low, low + step, ... up to high.
        count = int((high - low) / parameter.step) + 1
        value = low + rng.randrange(count) * parameter.step
        # Round away float drift (0.060000000000000005) using the step's own
        # decimal places, so the value reads like the professor's grid.
        decimals = max(_decimals(low), _decimals(parameter.step))
        return round(value, decimals)
    return round(rng.uniform(low, high), 6)


def _decimals(value: float) -> int:
    text = f"{value:g}"
    if "." not in text or "e" in text or "E" in text:
        return 0
    return len(text.split(".")[1])
