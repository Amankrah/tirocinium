"""Concepts (milestone 2.1, mastery spec section 2): a course's flat,
professor-owned list of concepts, stored in the per-course shard. Case
studies map to these with weights; the mapping surface lives in the case
studies module."""

from app.concepts.routes import router

__all__ = ["router"]
