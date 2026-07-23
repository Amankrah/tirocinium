"""Courses: milestone 1.5 carries only creation and the ownership check
(seat management is owner-only); the full CRUD is Phase 2.1."""

from app.courses.routes import ensure_course_owner, router

__all__ = ["ensure_course_owner", "router"]
