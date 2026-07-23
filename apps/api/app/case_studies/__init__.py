"""Case study authoring (milestone 2.1): CRUD with compressed markdown
bodies, publish states, and case-to-concept mappings (mastery spec section
2). All content lives in the per-course shard; access is nested under the
course, since per-shard integer ids collide across courses (decision 0013)."""

from app.case_studies.routes import router

__all__ = ["router"]
