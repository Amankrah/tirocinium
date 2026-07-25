"""The parameter specification (backend guide 6.1, milestone 5.1): the typed
description of what may vary in a case study, authored by the professor (or
proposed by the AI in 5.2 and edited by the professor). Four parameter types
(number, integer, choice, entity), plain-language invariants passed verbatim
into generation and verification prompts, and a free-text solution method.

Each parameter carries its `base` value: the value the parameter has in the
base case study's text. The guide's representative JSON omits it, but both the
figure-frozen check (does this value appear inside a figure?) and rendering the
base scenario need it, so it is part of the stored spec (decision 0036).
"""

from typing import Annotated, Literal

from pydantic import BaseModel, Field, model_validator

# Parameter names become tokens in the case study source, so they stay clean
# identifiers: lower-case, digits, underscores, starting with a letter.
NAME_PATTERN = r"^[a-z][a-z0-9_]*$"


class NumberParameter(BaseModel, frozen=True):
    type: Literal["number"]
    base: float
    range: tuple[float, float]
    step: float | None = Field(default=None, gt=0)

    @model_validator(mode="after")
    def _ordered_and_contains_base(self) -> "NumberParameter":
        lo, hi = self.range
        if not lo < hi:
            raise ValueError("range must be [low, high] with low < high")
        if not lo <= self.base <= hi:
            raise ValueError("base must lie within the range")
        return self


class IntegerParameter(BaseModel, frozen=True):
    type: Literal["integer"]
    base: int
    # strict=True keeps JSON floats (8.5) out of an integer range.
    range: tuple[
        Annotated[int, Field(strict=True)], Annotated[int, Field(strict=True)]
    ]

    @model_validator(mode="after")
    def _ordered_and_contains_base(self) -> "IntegerParameter":
        lo, hi = self.range
        if not lo < hi:
            raise ValueError("range must be [low, high] with low < high")
        if not lo <= self.base <= hi:
            raise ValueError("base must lie within the range")
        return self


class ChoiceParameter(BaseModel, frozen=True):
    type: Literal["choice"]
    base: str
    options: list[str] = Field(min_length=2)

    @model_validator(mode="after")
    def _base_is_an_option(self) -> "ChoiceParameter":
        if self.base not in self.options:
            raise ValueError("base must be one of the options")
        return self


class EntityParameter(BaseModel, frozen=True):
    """A named thing the generator may replace freely (a company, a person, a
    product), guided by a short description of what would keep the problem
    coherent."""

    type: Literal["entity"]
    base: str = Field(min_length=1)
    description: str | None = None


Parameter = Annotated[
    NumberParameter | IntegerParameter | ChoiceParameter | EntityParameter,
    Field(discriminator="type"),
]


class ParamSpec(BaseModel, frozen=True):
    """The stored specification. Invariants are the professor's control over
    pedagogical equivalence and travel verbatim into generation and
    verification prompts (guide 6.1)."""

    parameters: dict[Annotated[str, Field(pattern=NAME_PATTERN)], Parameter] = Field(
        default_factory=dict
    )
    invariants: list[str] = Field(default_factory=list)
    solution_method: str | None = None
