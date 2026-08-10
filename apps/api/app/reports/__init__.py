"""Course reporting (milestone 8.3): activity by seat number, token and speech
usage per course, the two product-health dashboards (recognition confidence
distribution, variant verification pass rate), and the mastery specification's
calibration loop, the defence rubric tracked against professor grades. All
four are professor-and-owner reads over rows the pipelines already write; none
of them computes new evidence."""

from app.reports.routes import router

__all__ = ["router"]
