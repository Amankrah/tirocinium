"""Mastery integration (Phase 6): evidence emission from the pipelines, the
student's picture with its trails, the revisit queue, the professor's
distribution, and the parameter-version migration path. All arithmetic lives
in platform_core.mastery; all shard access goes through the mastery_store
adapter inside the writer's transaction."""

from app.mastery.routes import router

__all__ = ["router"]
