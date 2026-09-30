"""The course pack as a versioned file asset (decision 0077).

A pack is one course's taught content: its concepts, its practice questions
with the professor's own worked solutions, and the figures those questions
read from. It lives at `apps/api/coursepack/{id}/vN.json` beside a changelog
and is loaded the way `app.prompts` loads a prompt and `app.marketplace`
loads a catalogue, for the same reason: it is reviewed, diffed and versioned
like code, and nothing at runtime edits it.

Figures travel as committed bytes, not as a path into the professor's
materials folder. That folder is two gigabytes of lectures and videos and is
not in the repository, so a pack that reached into it would load on one
machine and fail on every other. The bytes under `figures/` are what the
deterministic extractor pulled out of the original PDF, unaltered, and the
`source` block on each figure records exactly where they came from so the
provenance survives the copy.

A body refers to a figure by the pack's own key (`![alt](pack:l1-directions)`)
rather than by a `fig://` id, because the id is a shard row that does not
exist until the pack is loaded. The loader rewrites the scheme once it has
the row, which is what lets the same pack load into any number of courses.
"""

import json
import re
from functools import cache
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field, model_validator

PACK_ROOT = Path(__file__).resolve().parent.parent.parent / "coursepack"

# How a pack body names a figure before the loader knows its row id.
PACK_SCHEME = "pack:"
PACK_TOKEN = re.compile(r"\]\(" + re.escape(PACK_SCHEME) + r"([A-Za-z0-9][A-Za-z0-9-]*)\)")

FigureKind = Literal["embedded_raster", "vector_render", "page_crop"]


def figure_keys_in(markdown: str) -> list[str]:
    """Every distinct pack figure key the markdown references, in first-seen
    order. The loader and the validator below share this, so a body can never
    disagree with the list of figures declared for its question."""
    seen: list[str] = []
    for match in PACK_TOKEN.finditer(markdown):
        key = match.group(1)
        if key not in seen:
            seen.append(key)
    return seen


class FigureSource(BaseModel):
    """Where a figure's pixels came from, kept so the copy is traceable back
    to the professor's original after the bytes are committed here."""

    document: str = Field(min_length=1)
    page: int = Field(ge=0)
    # Normalised to 0..1 of the page, top-left origin: decision 0032's frame,
    # so a pack figure and an imported one describe position the same way.
    bbox: tuple[float, float, float, float]
    kind: FigureKind


class PackFigure(BaseModel):
    """One committed figure. `sha256` is the content hash of `file`'s bytes and
    is verified on load, because a figure that silently changed under a course
    is the one thing the figures-are-pixels constraint exists to prevent."""

    key: str = Field(pattern=r"^[a-z0-9][a-z0-9-]*$")
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    file: str = Field(min_length=1)
    width_px: int = Field(gt=0)
    height_px: int = Field(gt=0)
    caption: str | None = None
    source: FigureSource


class PackConcept(BaseModel):
    """A concept in the mastery-spec sense (section 2): the thing a student is
    said to understand or not, and what evidence accrues against."""

    key: str = Field(pattern=r"^[a-z0-9][a-z0-9-]*$")
    name: str = Field(min_length=1, max_length=120)
    description: str | None = None


class ConceptWeight(BaseModel):
    """A question's mapping to one concept. Weights are independent and are
    never normalised across a question (mastery spec section 2)."""

    key: str = Field(pattern=r"^[a-z0-9][a-z0-9-]*$")
    weight: float = Field(gt=0, le=1)


class PackQuestion(BaseModel):
    """One practice question: the professor's statement, the professor's worked
    solution, and the answers the comparer matches a transcription against.

    The solution is part of the pack rather than something a model derives
    later, because it is what the understanding unfold splits into steps and
    what the defence tutor holds as ground truth. Both need the professor's
    own working, not a reconstruction of it.
    """

    key: str = Field(pattern=r"^[a-z0-9][a-z0-9-]*$")
    title: str = Field(min_length=1, max_length=200)
    concepts: list[ConceptWeight] = Field(min_length=1)
    source: str = Field(min_length=1)
    body_md: str = Field(min_length=1)
    solution_md: str = Field(min_length=1)
    # Final answers in the shape milestone 5.3 stores them, so answer_match
    # (platform_core.compare) reads a pack question exactly as it reads a
    # generated variant. An essay question carries an empty list and simply
    # emits no answer_match evidence.
    final_answers: list[str] = Field(default_factory=list)
    figures: list[str] = Field(default_factory=list)
    # The marketplace shortlist for this question, in the order the student
    # meets it (course migration 0021). Its presence is the statement that this
    # question is a selection decision, which is what decides whether the
    # problem view offers "Price your materials" at all (decision 0081). It
    # narrows and never restricts: a student may still quote any line in the
    # catalogue, because deciding a material is wrong is the exercise.
    shortlist: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def _figures_match_the_tokens(self) -> "PackQuestion":
        """Declared figures and referenced figures are the same set. A token
        with no declaration would load as a dead image, and a declaration with
        no token would attach a figure the student never sees to the tutor's
        context."""
        referenced = set(figure_keys_in(self.body_md)) | set(figure_keys_in(self.solution_md))
        declared = set(self.figures)
        if referenced != declared:
            missing = sorted(referenced - declared)
            unused = sorted(declared - referenced)
            raise ValueError(
                f"question {self.key}: figures declared {sorted(declared)} but"
                f" referenced {sorted(referenced)}"
                + (f"; undeclared {missing}" if missing else "")
                + (f"; unreferenced {unused}" if unused else "")
            )
        return self


class CoursePack(BaseModel):
    """A whole course's taught content at one revision."""

    id: str = Field(pattern=r"^[a-z0-9][a-z0-9-]*$")
    version: int = Field(ge=1)
    title: str = Field(min_length=1, max_length=200)
    course_note: str = Field(default="")
    # The materials catalogue this course quotes against, if it quotes at all
    # (directory migration 0005). Null on both means it does not.
    catalogue_id: str | None = None
    catalogue_version: int | None = None
    concepts: list[PackConcept] = Field(min_length=1)
    figures: list[PackFigure] = Field(default_factory=list)
    questions: list[PackQuestion] = Field(min_length=1)

    @model_validator(mode="after")
    def _references_resolve(self) -> "CoursePack":
        """Every key a question names exists, and no key is defined twice. The
        extractor fails rather than writes on any of this, the way the
        catalogue extractor refuses a brief naming a line that does not exist.
        """
        for label, keys in (
            ("concept", [c.key for c in self.concepts]),
            ("figure", [f.key for f in self.figures]),
            ("question", [q.key for q in self.questions]),
        ):
            duplicates = sorted({k for k in keys if keys.count(k) > 1})
            if duplicates:
                raise ValueError(f"duplicate {label} keys: {duplicates}")

        concepts = {c.key for c in self.concepts}
        figures = {f.key for f in self.figures}
        for question in self.questions:
            unknown_concepts = sorted({c.key for c in question.concepts} - concepts)
            if unknown_concepts:
                raise ValueError(
                    f"question {question.key} maps to unknown concepts {unknown_concepts}"
                )
            unknown_figures = sorted(set(question.figures) - figures)
            if unknown_figures:
                raise ValueError(
                    f"question {question.key} references unknown figures {unknown_figures}"
                )

        # A shortlisted SKU that is not in the pinned catalogue would load as a
        # link to nothing, so this fails rather than writes, the same way the
        # catalogue extractor refuses a brief naming a line that does not exist.
        if any(q.shortlist for q in self.questions) and self.catalogue_id is not None:
            from app.marketplace.catalogue import load_catalogue

            catalogue = load_catalogue(self.catalogue_id, self.catalogue_version or 1)
            skus = {line.sku for line in catalogue.lines}
            for question in self.questions:
                unknown = sorted(set(question.shortlist) - skus)
                if unknown:
                    raise ValueError(
                        f"question {question.key} shortlists SKUs absent from"
                        f" {self.catalogue_id}/v{self.catalogue_version}: {unknown}"
                    )
        return self

    def figure(self, key: str) -> PackFigure:
        for candidate in self.figures:
            if candidate.key == key:
                return candidate
        raise KeyError(key)

    @property
    def provenance(self) -> str:
        """The stable id recorded against everything this pack produced."""
        return f"{self.id}/v{self.version}"


@cache
def load_pack(pack_id: str, version: int, root: Path | None = None) -> CoursePack:
    """Load pack `pack_id` at `version`. A missing file is a deployment error
    rather than a runtime condition, so it raises."""
    base = root or PACK_ROOT
    path = base / pack_id / f"v{version}.json"
    pack = CoursePack.model_validate(json.loads(path.read_text(encoding="utf-8")))
    if pack.id != pack_id or pack.version != version:
        raise ValueError(
            f"{path} declares {pack.id}/v{pack.version} but was loaded as {pack_id}/v{version}"
        )
    return pack


def pack_dir(pack_id: str, root: Path | None = None) -> Path:
    return (root or PACK_ROOT) / pack_id
