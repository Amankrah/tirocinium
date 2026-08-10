"""Provider rates for the cost half of course reporting (milestone 8.3).

The guides ask for "token and cost per course" but name no prices, and prices
are an operator fact that changes without warning, so none are hard-coded here.
Rates come from configuration, and when none is configured the reports carry
usage with a null cost and say so (`priced: false`) rather than showing a
number nobody can stand behind.

Two variables, both JSON, both optional:

    TIRO_MODEL_PRICES={"claude-x": {"input_per_mtok": 3.0, "output_per_mtok": 15.0}}
    TIRO_SPEECH_PRICES={"defense_tts": 0.00002, "defense_stt": 0.0043}

Model rates are per million tokens, and speech rates are per unit of whatever
`speech_usage.unit` records for that kind (seconds for recognition, characters
for synthesis), which are the shapes the providers publish. A model or kind
with no rate prices as unknown, not as free.
"""

import json
import os

from pydantic import BaseModel, Field

TOKENS_PER_PRICED_UNIT = 1_000_000


class ModelRate(BaseModel, frozen=True):
    input_per_mtok: float = Field(ge=0.0)
    output_per_mtok: float = Field(ge=0.0)


class Rates(BaseModel, frozen=True):
    """The configured price list. Empty means unpriced, which is the default
    and an honest state, not a misconfiguration."""

    models: dict[str, ModelRate] = Field(default_factory=dict)
    speech: dict[str, float] = Field(default_factory=dict)

    @property
    def configured(self) -> bool:
        return bool(self.models) or bool(self.speech)

    def token_cost(
        self, model_id: str, input_tokens: int, output_tokens: int
    ) -> float | None:
        """Cost of one model's usage, or None when that model has no rate."""
        rate = self.models.get(model_id)
        if rate is None:
            return None
        return (
            input_tokens * rate.input_per_mtok + output_tokens * rate.output_per_mtok
        ) / TOKENS_PER_PRICED_UNIT

    def speech_cost(self, kind: str, amount: float) -> float | None:
        """Cost of one speech kind's usage, or None when it has no rate."""
        rate = self.speech.get(kind)
        if rate is None:
            return None
        return amount * rate


def _load_json(name: str) -> object:
    raw = os.environ.get(name)
    if not raw:
        return None
    try:
        return json.loads(raw)
    except ValueError:
        # A malformed price list must not take the reports down; it prices as
        # unknown, which is the same honest state as no configuration at all.
        return None


def load_rates() -> Rates:
    """Read the configured rates. Read per request rather than cached, so an
    operator correcting a rate does not need a restart to see it."""
    models: dict[str, ModelRate] = {}
    raw_models = _load_json("TIRO_MODEL_PRICES")
    if isinstance(raw_models, dict):
        for model_id, rate in raw_models.items():
            if isinstance(rate, dict):
                try:
                    models[str(model_id)] = ModelRate.model_validate(rate)
                except ValueError:
                    continue

    speech: dict[str, float] = {}
    raw_speech = _load_json("TIRO_SPEECH_PRICES")
    if isinstance(raw_speech, dict):
        for kind, rate in raw_speech.items():
            if isinstance(rate, int | float) and rate >= 0:
                speech[str(kind)] = float(rate)

    return Rates(models=models, speech=speech)
