"""The materials marketplace (Phase 10, decision 0062).

Suppliers, a shortlist, a basket and a numbered quotation, so that choosing a
material costs something and the student has a figure to defend. Prices are
struck per variant from the variant's own seed, so no two students hold the
same number and a quotation cannot be passed around.
"""

from app.marketplace.authoring import router as authoring_router
from app.marketplace.routes import router

__all__ = ["authoring_router", "router"]
