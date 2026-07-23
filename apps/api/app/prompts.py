"""Versioned prompt loader (model-call rules, CLAUDE.md). Every prompt shipped
to a model lives as a file under apps/api/prompts/{name}/{version}.md with a
changelog, because prompts are code; the version string travels with each
generated artifact as provenance. This module only reads them.
"""

from dataclasses import dataclass
from functools import cache
from pathlib import Path

PROMPTS_ROOT = Path(__file__).resolve().parent.parent / "prompts"


@dataclass(frozen=True)
class Prompt:
    """A loaded prompt and its provenance identifier."""

    name: str
    version: str
    text: str

    @property
    def provenance(self) -> str:
        """The stable id stored alongside anything this prompt produced."""
        return f"{self.name}/{self.version}"


@cache
def load_prompt(name: str, version: str) -> Prompt:
    """Load prompt `name` at `version` (e.g. load_prompt('handwriting-
    transcription', 'v1')). Raises FileNotFoundError if the version file is
    absent, which is a deployment error, not a runtime condition."""
    path = PROMPTS_ROOT / name / f"{version}.md"
    return Prompt(name=name, version=version, text=path.read_text(encoding="utf-8"))
